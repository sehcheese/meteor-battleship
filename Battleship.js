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
		if(boardHandle.ready()) {
			var playerBoardDocument = Board.findOne({forPlayer: Meteor.userId()});
			if(playerBoardDocument != null) {
				console.log("HHHEEERRREEE");
				var cells = playerBoardDocument.boardCells;
				for(var i = 0; i < numberRows; i++) {
					for(var j = 0; j < numberColumns; j++) {
						if(cells != null && cells[i][j].isShip) {
							console.log("changeCSSTracker");
							$('td[data-row="' + i + '"][data-col="' + j + '"]').addClass("unhit-ship-cell");
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
		},
		'click #reset': function() {
			Meteor.call("reset");
		},
	});
	
	Template.board.events({
		'click td': function(event) {
			var isTurn = Players.findOne({ player: Meteor.userId() }).isTurn;
			console.log("isTurn: " + isTurn);
			if(isTurn) {
				var clickedRow = parseInt(event.target.attributes["data-row"].value);
				var clickedColumn = parseInt(event.target.attributes["data-col"].value);
				Meteor.call("fireShot", clickedRow, clickedColumn);
			}
		}
	});
	
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
						Meteor.setTimeout(function() { // Timeout for first turn needs to be set up manually because there's not a preceding turn triggering it
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
	reset: function() {
		Players.remove({});
		
		Game.remove({});
		
		Board.remove({});
		
		Game.insert({
			field: "gameStarted",
			value: false
		});
		
		Game.insert({
			field: "status",
			value: "Waiting for players to join...",
			cssClass: "alert alert-warning"
		});
		
		playerNumber = 0;
		playerAdded = false;
	},
	fireShot: function(clickedRow, clickedColumn) {
		console.log(clickedRow);
		console.log(clickedColumn);	
		
		var clickedCell = Board.findOne({row: clickedRow, column: clickedColumn});
		if(clickedCell.isShip) { // Ship in this cell
			console.log("Is Ship!");
			if(clickedCell.isHit) { // Ship already hit
				console.log("Already Hit!");
			} else { // Ship not yet hit
				console.log("Hit Ship!");
				if(Meteor.isClient) {
					$('td[data-row="' + clickedRow + '"][data-col="' + clickedColumn + '"]').addClass("hit-ship-cell");
				}
				
				Board.update({row: clickedRow, column: clickedColumn}, {$set: {isHit: true}});
				
				// TODO CHeck if ship sunk; if player has no ships left, remove from rotation
				
				// Award points to player
				var currentScore = Players.findOne({ player: Meteor.userId() }).score;
				Players.update({player: Meteor.userId()}, {$set: { score: currentScore + 1 }});
			}
		} else { // No ship in this cell
			console.log("Not A Ship!");
			if(Meteor.isClient) {
				$('td[data-row="' + clickedRow + '"][data-col="' + clickedColumn + '"]').addClass("missed-ship-cell");
			}
		}

		shotsFired = true;
		advanceToNextPlayer();
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
	// Add their ships to the global board and display them in their view
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
					emptyCells[i].push({
						isShip: false,
						shipType: "",
						isHit: false
					});
				}
			}
			
			Board.insert({
				forPlayer: Meteor.userId(),
				boardCells: emptyCells
			});
			console.log("board created for player");
			generateShip(2, "Destroyer", numberRows, numberColumns);
			generateShip(3, "Submarine", numberRows, numberColumns);
			generateShip(3, "Cruiser", numberRows, numberColumns);
			generateShip(4, "Battleship", numberRows, numberColumns);
			generateShip(5, "Carrier", numberRows, numberColumns);
		}
		
	}
});

// Initialize empty board
function setUpBoard() {
	var numberRows = Game.findOne({field: "board"}).numberRows;
	var numberColumns = Game.findOne({field: "board"}).numberColumns;
	
	// For each cell, add data fields
	var cells = [];
	for(var i = 0; i < numberRows; i++) {
		for(var j = 0; j < numberColumns; j++) {
			cells.push({
				row: i,
				column: j,
				isShip: false,
				shipOwner: "",
				shipType: "",
				isHit: false
			});
		}
	}
}

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
			//Board.update({row: randomRow - i, column: randomColumn}, {$set: {isShip: true, shipOwner: Meteor.userId(), shipType: shipType, isHit: false}});
			//console.log("ship cell added at")
			//console.log(Board.findOne({row: randomRow - i, column: randomColumn}));
		}
	} else if(randomDirection == 1) { // Place eastward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow][randomColumn + i].isShip = true;
			boardCells[randomRow][randomColumn + i].shipType = shipType;
			//Board.update({row: randomRow, column: randomColumn + i}, {$set: {isShip: true, shipOwner: Meteor.userId(), shipType: shipType, isHit: false}});
			//console.log("ship cell added at")
			//console.log(Board.findOne({row: randomRow - i, column: randomColumn}));
		}
	} else if(randomDirection == 2) { // Place southward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow + i][randomColumn].isShip = true;
			boardCells[randomRow + i][randomColumn].shipType = shipType;
			//Board.update({row: randomRow + i, column: randomColumn}, {$set: {isShip: true, shipOwner: Meteor.userId(), shipType: shipType, isHit: false}});
			//console.log("ship cell added at");
			//console.log(Board.findOne({row: randomRow - i, column: randomColumn}));
		}
	} else if(randomDirection == 3) { // Place westward for length of ship
		for(var i = 0; i < shipLength; i++) {
			boardCells[randomRow][randomColumn - i].isShip = true;
			boardCells[randomRow][randomColumn - i].shipType = shipType;
			//Board.update({row: randomRow, column: randomColumn - i}, {$set: {isShip: true, shipOwner: Meteor.userId(), shipType: shipType, isHit: false}});
			//console.log("ship cell added at");
			//console.log(Board.findOne({row: randomRow - i, column: randomColumn}));
		}
	}
	
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
		if(!Players.findOne({playerNumber: activePlayerNumber}).inGame) {
			foundNextPlayer = true;
			
			// Check if the found next player is the same as the last player to fire, indicating the end of the game
			if(activePlayerNumber == lastPlayerSequenceNumberToFire) {
				console.log("GAME OVER");
				Game.update({field: "status"}, {$set: { value: "Game over", cssClass: "alert alert-primary"}});
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
		
	Meteor.publish("board", function () {
			/*return Board.find({
				$or: [
				  { shipOwner: this.userId },
				  { shipOwner: "" }
				]
			  });*/
			  return Board.find({forPlayer: this.userId});
		});
}
