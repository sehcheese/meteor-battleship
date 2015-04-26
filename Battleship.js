Players = new Mongo.Collection("Players");
Game = new Mongo.Collection("Game");
Board = new Mongo.Collection("Board");

var numberRows = 20;
var numberColumns = 20;

if (Meteor.isClient) {
	
	Meteor.subscribe("players");
	Meteor.subscribe("game");
	var boardHandle = Meteor.subscribe("board");
	
	Tracker.autorun(function() {
		// Every time the Board dataset is updated, go through here and redraw the board for this player
		if(boardHandle.ready()) {
			var playerBoardDocument = Board.findOne({forPlayer: Meteor.userId()});
			if(playerBoardDocument != null) {
				var cells = playerBoardDocument.boardCells;
				for(var i = 0; i < numberRows; i++) {
					for(var j = 0; j < numberColumns; j++) {
						var cellSelectorString = 'td[data-row="' + i + '"][data-col="' + j + '"]';
						if(cells[i][j].isShip) { // This cell contains a ship that belongs to this player
							$(cellSelectorString).removeClass(); // Clear existing classes
							if(cells[i][j].isHit) { // Own ship is hit
								$(cellSelectorString).addClass("own-ship-hit-cell");
							} else { // Own ship is not hit
								$(cellSelectorString).addClass("own-ship-cell");
							}
						} else if(cells[i][j].isHit) { // Player hit a ship in this cell
							$(cellSelectorString).addClass("hit-shot-cell");
						} else if(cells[i][j].isMiss) {
							$(cellSelectorString).addClass("missed-shot-cell");
						}
					}
				}
			}
		}
	});
	
	Template.joinGame.helpers({
		// Return if the game is started or not
		gameBegun: function() {
			return Game.findOne({field: "gameStarted"}).value;
		}
	});
	
	Template.statusBar.helpers({
		// Return the status of the game
		status: function() {
			return Game.findOne({field: "status"}).value;
		},
		cssClass: function() {
			return Game.findOne({field: "status"}).cssClass;
		}
	});
	
	// Provides values to the players template
	Template.players.helpers({
		// Return all the players
		players: function () {
			return Players.find({});
		}
	});
	
	// Handles events from within the players template
	Template.joinGame.events({
		'click #join_game': function() {
			Meteor.call("addPlayer");
		}
	});
	
	Template.board.events({
		'click td': function(event) {
			var isTurn = Players.findOne({ player: Meteor.userId() }).isTurn; // Ascertain it is this player's turn
			if(isTurn) {
				var clickedRow = parseInt(event.target.attributes["data-row"].value);
				var clickedColumn = parseInt(event.target.attributes["data-col"].value);
				Meteor.call("fireShot", clickedRow, clickedColumn);
			}
		}
	});
	
	// Dynamically generate the battleship board
	Template.board.rendered = function() {
		var tableHtml;
		
		for(var i = 0; i < numberRows; i++) {
			tableHtml += "<tr>";
			for(var j = 0; j < numberColumns; j++) {
				tableHtml += '<td data-row="' + i + '" data-col="' + j + '" class="fire-shot"></td>'
			}
			tableHtml += "</tr>";
		}
		
		$("#game_board").append(tableHtml);
	};
	
	Template.board.helpers({
		// Return board layout
		rows: function () {
			return Game.findOne({field: "board"}).numberRows;
		}
	});
	
	Template.board.helpers({
		// Return board layout
		columns: function () {
			return Game.findOne({field: "board"}).numberColumns;
		}
	});
	
	// Set up accounts to require a username only, not an email address
	Accounts.ui.config({
		passwordSignupFields: "USERNAME_ONLY"
	});
}

// Server-only code
if (Meteor.isServer) {
	Meteor.startup(function () {
		// TODO move these to a place where they are called each time a new game is started?
		
		// Clear players on startup
		Players.remove({});
		
		// Clear game information
		Game.remove({});
		
		Board.remove({});
	});
}

Meteor.startup(function() {
	Meteor.call("initialize");
});

// Identifier for players, incremented as they are added.
// Tracks with the current number of players because it starts at 0 and is incremented after each one is added.
var playerNumber = 0;

// Flag indicating whether a player has been added in the last time interval, referenced in periodicStartGameCheck
var playerAdded = false;

// Keeps track of the index of the player whose turn it is
var activePlayerNumber;

var shotsFired = false;

var initialized = false;

// Methods called from the client side, but run on the server side for security
Meteor.methods({
	// Add a player
	addPlayer: function() {
		Players.insert({
			player: Meteor.userId(),
			displayName: Meteor.user().username,
			playerNumber: playerNumber,
			isTurn: false,
			inGame: true,
			score: 0
		});
		
		playerNumber++;
		playerAdded = true;
		
		if(Meteor.isClient) {
			$("#join_game").prop("disabled",true);
		}
		
		// Build board for this player
		Meteor.call("setUpBoard");
		
		// Player added, should we start the game?
		// There must be at least two players.
		// Once two players are ready to start the game, start a timer to check if anyone joins in a set amount of time since the last player joined.
		// Since this block is run every time a player joins, the timer resets after every new player joins.
		if (Meteor.isServer) { // Only run this check on the server, not the client-side simulation
			if(playerNumber > 1) { // There must be at least two players
				playerAdded = false; // Clear the flag that was just set telling that a player was added. It will be set to true again if a player joins in the given interval.
				Meteor.setTimeout(function() { // After ten seconds check if another player has been added
					if(!playerAdded || playerNumber > 5) { // Player was not added in time interval since last player was added or the max number of players has been reached; start the game.
						// Time to start the game
						
						// Give the first turn to the first player who joined
						Players.update({playerNumber: 0}, {$set: { isTurn: true }});
						activePlayerNumber = 0;
						turnTimeout = Meteor.setTimeout(function() { // Timeout for first turn needs to be set up manually because there's not a preceding turn triggering it
							if(!shotsFired) {
								advanceToNextPlayer();
							}
						}, 15000); // 15 seconds max per turn (including for this, the first turn)
						
						// Indicate that the game has started
						Game.update({field: "gameStarted"}, {$set: { value: true }});
						Game.update({field: "status"}, {$set: { value: "Game in progress", cssClass: "alert alert-success"}});
					}
				}, 5000);
			}
		}
	},
	// Player fires a shot on his turn
	fireShot: function(clickedRow, clickedColumn) {
		// Make sure player is not firing on own ship or somewhere they have already fired
		var personalCells = Board.findOne({forPlayer: Meteor.userId()}).boardCells;
		if(personalCells[clickedRow][clickedColumn].isShip) { // Firing on ship, return
			return;
		} else if(personalCells[clickedRow][clickedColumn].isHit || personalCells[clickedRow][clickedColumn].isMiss) { // Firing on somewhere already fired on, return
			return;
		}
		
		if(Meteor.isServer) {
			// Get the boards for every player as an array (note the array is non-reactive, that's why we have to do the Board.update statements)
			var boards = Board.find().fetch();
			
			// Check in the board of each player (including the board of the shooter) to see if there is a ship there
			var hitAShip = false; // Flag indicating whether we hit a ship or not, used in updating shooter's board
			for(var boardNumber = 0; boardNumber < boards.length; boardNumber++) { // Loop through the boards of every player
				var boardOwner = boards[boardNumber].forPlayer; // Get the owner of this board
				var boardCells = boards[boardNumber].boardCells; // Get the cells of this board
				
				if(boardCells[clickedRow][clickedColumn].isShip) { // There is a ship in clicked cell
					hitAShip = true;
					
					if(!boardCells[clickedRow][clickedColumn].isHit) { // Ship not already hit, update as hit for player who owns the ship
						var currentScore = Players.findOne({ player: Meteor.userId() }).score;
						Players.update({player: Meteor.userId()}, {$set: { score: currentScore + 1 }});
						
						boardCells[clickedRow][clickedColumn].isHit = true;
						Board.update({forPlayer: boardOwner}, {$set: {boardCells: boardCells}});
					}					
					
					// TODO CHeck if ship sunk; if player has no ships left, remove from rotation
					
					break; // Found that there was a ship hit, no need to keep looping
				}
			}
			
			// Now update board of player who fired the shot based on whether the shot was a hit or miss
			if(hitAShip) { // Indicate hit to player who fired the shot
				personalCells[clickedRow][clickedColumn].isHit = true;
				Board.update({forPlayer: Meteor.userId()}, {$set: {boardCells: personalCells}});
			} else { // Indicate miss to player who fired the shot
				personalCells[clickedRow][clickedColumn].isMiss = true;
				Board.update({forPlayer: Meteor.userId()}, {$set: {boardCells: personalCells}});
			}
			
			// Advance to next player's turn
			shotsFired = true;
			advanceToNextPlayer();
		}
	},
	initialize: function() {
		if(!initialized) { // Protects from refreshes
			initialized = true;
			
			// Set game as not started
			Game.insert({
				field: "gameStarted",
				value: false
			});
			
			Game.insert({
				field: "status",
				value: "Waiting for players to join...",
				cssClass: "alert alert-warning"
			});
			
			// Build board
			Game.insert({
				field: "board",
				numberRows: 20,
				numberColumns: 20
			});
			
			//setUpBoard();
			
			playerNumber = 0;
			playerAdded = false;
		}
	},
	// Set up the board for each player once they have joined the game
	// Each player has their own board in the dataset; there is no global board
	// Not responsible for overlapping ships, this should be handled in generateShip
	setUpBoard: function() {
		if(Meteor.isServer) {
			var numberRows = Game.findOne({field: "board"}).numberRows;
			var numberColumns = Game.findOne({field: "board"}).numberColumns;
			
			// Make an empty board
			var emptyCells = [];
			for(var i = 0; i < numberRows; i++) {
				emptyCells[i] = []
				for(var j = 0; j < numberColumns; j++) {
					// Add a cell obect to this 2D array
					emptyCells[i].push({
						isShip: false, // Indicates if there is a ship in this spot, that is, one of this player's own ships
						shipType: "", // Indicates the type of ship if there is a ship in this spot, therefore it is only set for this player's own ships
						isHit: false, // Indicates if there is a hit in this square, whether on this player's own ship or on another player's ship
						isMiss: false // Indicates if the player has shot this square but it has not hit any other player's ships
					});
				}
			}
			
			Board.insert({
				forPlayer: Meteor.userId(),
				boardCells: emptyCells
			});
			
			generateShip(2, "Destroyer", numberRows, numberColumns);
			generateShip(3, "Submarine", numberRows, numberColumns);
			generateShip(3, "Cruiser", numberRows, numberColumns);
			generateShip(4, "Battleship", numberRows, numberColumns);
			generateShip(5, "Carrier", numberRows, numberColumns);
		}
		
	}
});

function generateShip(shipLength, shipType, numberRows, numberColumns) {
	// Generate random starting cell and direction
	var randomRow = Math.floor((Math.random() * numberRows));
	var randomColumn = Math.floor((Math.random() * numberColumns));
	var randomDirection = Math.floor((Math.random() * 4)); // Random direction of four directions: 0 == North, 1 == East, 2 == South, 3 == West
	
	// See if ship can exist in randomly selected spot
	
	// Get current board for this player
	var boardCells = Board.findOne({forPlayer: Meteor.userId()}).boardCells;
	
	// Check if generated start spot is already on an existing ship
	if(boardCells[randomRow][randomColumn].isShip) {
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	}
	
	// Check if flows over edge of board
	if(randomDirection == 0 && randomRow - shipLength < 0) { // Flows over north (top) edge, regenerate
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	} else if(randomDirection == 1 && randomColumn + shipLength > numberColumns - 1) { // Flows over east (right) edge, regenerate
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	} else if(randomDirection == 2 && randomRow + shipLength > numberRows - 1) { // Flows over south (bottom) edge, regenerate
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	} else if(randomDirection == 3 && randomColumn - shipLength < 0) { // Flows over west (left) edge, regenerate
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	}
	
	// Check if would occupy spot of existing ship
	// Must check in every player's board, including one's own
	var boards = Board.find().fetch();
	for(var boardNumber = 0; boardNumber < boards.length; boardNumber++) {
		var playerBoard = boards[boardNumber].boardCells; // The board we are currently checking
		
		if(randomDirection == 0) { // Check northward for length of ship 
			for(var i = 1; i < shipLength; i++) {
				if(playerBoard[randomRow - i][randomColumn].isShip) {
					generateShip(shipLength, shipType, numberRows, numberColumns);
					return;
				}
			}
		} else if(randomDirection == 1) { // Check eastward for length of ship
			for(var i = 1; i < shipLength; i++) {
				if(playerBoard[randomRow][randomColumn + i].isShip) {
					generateShip(shipLength, shipType, numberRows, numberColumns);
					return;
				}
			}
		} else if(randomDirection == 2) { // Check southward for length of ship
			for(var i = 1; i < shipLength; i++) {
				if(playerBoard[randomRow + i][randomColumn].isShip) {
					generateShip(shipLength, shipType, numberRows, numberColumns);
					return;
				}
			}
		} else if(randomDirection == 3) { // Check westward for length of ship
			for(var i = 1; i < shipLength; i++) {
				if(playerBoard[randomRow][randomColumn - i].isShip) {
					generateShip(shipLength, shipType, numberRows, numberColumns);
					return;
				}
			}
		}
	}
	
	// We have now checked that the generated ship does not flow off the board or overlap with any other existing ships.
	// Therefore, place it on the board.
	if(randomDirection == 0) { // Place northward for length of ship 
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow - i][randomColumn].isShip = true;
			boardCells[randomRow - i][randomColumn].shipType = shipType;
		}
	} else if(randomDirection == 1) { // Place eastward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow][randomColumn + i].isShip = true;
			boardCells[randomRow][randomColumn + i].shipType = shipType;
		}
	} else if(randomDirection == 2) { // Place southward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow + i][randomColumn].isShip = true;
			boardCells[randomRow + i][randomColumn].shipType = shipType;
		}
	} else if(randomDirection == 3) { // Place westward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow][randomColumn - i].isShip = true;
			boardCells[randomRow][randomColumn - i].shipType = shipType;
		}
	}
	
	// Put the generated ship in the current player's board
	Board.update({forPlayer: Meteor.userId()}, {$set: {boardCells: boardCells}});
}

// Advance to the next turn
// Players have a set time to fire a shot or they forfeit their turn.
var turnTimeout; // Variable for the timeout function
var lastPlayerSequenceNumberToFire;
function advanceToNextPlayer() {
	// Note player who last fired; if it becomes this player's turn again the game is over
	lastPlayerSequenceNumberToFire = activePlayerNumber;
	
	// Set isTurn to false for player who just fired
	Players.update({playerNumber: activePlayerNumber}, {$set: { isTurn: false }});
	
	// Set isTurn to true for next player in sequence who is still in the game
	var foundNextPlayer = false;
	while(!foundNextPlayer) {
		// Increment activePlayerNumber to next player in sequence
		if(activePlayerNumber == playerNumber - 1) { // Reached last player in sequence; loop to start
			activePlayerNumber = 0;
		} else {
			activePlayerNumber++;
		}
		
		// Check if the next player is in the game (hasn't had all their ships eliminated)
		if(Players.findOne({playerNumber: activePlayerNumber}).inGame) {
			foundNextPlayer = true;
			
			// Check if the found next player is the same as the last player to fire, indicating the end of the game
			if(activePlayerNumber == lastPlayerSequenceNumberToFire) {
				console.log("GAME OVER");
				Game.update({field: "status"}, {$set: { value: "Game over", cssClass: "alert alert-info"}});
				Meteor.clearTimeout(turnTimeout); // Remove exiting time out; game is over
				return;
			}
		}
	}	
	
	Players.update({playerNumber: activePlayerNumber}, {$set: { isTurn: true }});
	
	// If player does not fire in certain amount of time, advance to next player
	Meteor.clearTimeout(turnTimeout); // Stop running the previous timeout, we're starting a new one for the next player
	if (Meteor.isServer) { // Only run this check on the server, not the client-side simulation
		shotsFired = false; // Clear the shotsFired flag, it will be reset to true if the player whose turn it is fires a shot before the timeout
		turnTimeout = Meteor.setTimeout(function() {
				if(!shotsFired) {
					advanceToNextPlayer();
				}
			}, 15000); // 15 seconds max per turn
	}
}

// Publish access to datastores
if(Meteor.isServer) {
	Meteor.publish("players", function () {
			return Players.find();
		});
		
	Meteor.publish("game", function () {
			return Game.find();
		});
	
	// Publish to each player only their own board
	Meteor.publish("board", function () {
			return Board.find({forPlayer: this.userId});
		});
}
