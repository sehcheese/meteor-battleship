Players = new Mongo.Collection("Players");
Game = new Mongo.Collection("Game");
Board = new Mongo.Collection("Board");

var numberRows = 20;
var numberColumns = 20;

if (Meteor.isClient) {
	
	Meteor.subscribe("players");
	Meteor.subscribe("game");
	Meteor.subscribe("board");
	
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
	
	Template.fireShot.helpers({
		isTurn: function() {
			var isTurn = Players.findOne({ player: Meteor.userId() });
			if(isTurn == null) {
				return false;
			} else {
				return isTurn.isTurn;
			}
		}
	});
	
	Template.board.events({
		'click td': function(event) {
			console.log(event.target.attributes["data-col"]);
			Meteor.call("test");
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
			isTurn: false
		});
		
		playerNumber++;
		playerAdded = true;
		
		if(Meteor.isClient) {
			$("#join_game").prop("disabled",true);
		}
		
		// Build board for this player
		Meteor.call("setUpBoard", null, function(error, result) {
				if(Meteor.isClient) {
					console.log("client");
					console.log(Board.findOne({row: 9, column: 9}));
					for(var i = 0; i < numberRows; i++) {
						for(var j = 0; j < numberColumns; j++) {
							if(Board.findOne({row: i, column: j}).isShip) {
								console.log("changeCSS");
								$('td[data-row="' + i + '"][data-col="' + j + '"]').addClass("unhit-ship-cell");
							}
						}
					}
				}
			});
		
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
	fireShot: function() {
		// Fire shot and do game stuff
		// TODO add code
		
		shotsFired = true;
		advanceToNextPlayer();
	},
	test: function() {
		console.log("SHOTS FIRED!!!!!!!!!!");
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
			
			setUpBoard();
			
			playerNumber = 0;
			playerAdded = false;
		}
	},
	// Set up the board for each player once they have joined the game
	// Add their ships to the global board and display them in their view
	// Not responsible for overlapping ships, this should be handled in generateBoardForPlayer
	setUpBoard: function() {		
		var numberRows = Game.findOne({field: "board"}).numberRows;
		var numberColumns = Game.findOne({field: "board"}).numberColumns;
		
		//if(Meteor.isServer) {
			var playerBoard = generateBoardForPlayer();
			// For each cell, if there is a ship add it to the board
			for(var i = 0; i < numberRows; i++) {
				for(var j = 0; j < numberColumns; j++) {
					if(playerBoard[i][j].isShip) { // If player's generated board contains a ship at this spot, update the global board
						console.log("addingShip");
						Board.update({row: i, column: j}, {$set: { 
							isShip: true, 
							shipOwner: Meteor.userId(), 
							shipType: playerBoard[i][j].shipType
						}});
						
						
					}
				}
			}
		//}
		
		/*if(Meteor.isClient) {
			console.log("client");
			for(var i = 0; i < numberRows; i++) {
				for(var j = 0; j < numberColumns; j++) {
					if(Board.findOne({row: i, column: j}).isShip) {
						console.log("changeCSS");
						$('td[data-row="' + i + '"][data-col="' + j + '"]').addClass("unhit-ship-cell");
					}
				}
			}
		}*/
	}
});

// Initialize empty board
function setUpBoard() {
	var numberRows = Game.findOne({field: "board"}).numberRows;
	var numberColumns = Game.findOne({field: "board"}).numberColumns;
	
	// For each cell, add data fields
	for(var i = 0; i < numberRows; i++) {
		for(var j = 0; j < numberColumns; j++) {
			Board.insert({
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

// Generate ship layout for one player who has just joined
// Responsible for making sure ships don't overlap
function generateBoardForPlayer() {
	var numberRows = Game.findOne({field: "board"}).numberRows;
	var numberColumns = Game.findOne({field: "board"}).numberColumns;
	
	var generatedBoard = [];
	
	// Create empty generated board of proper size
	for(var i = 0; i < numberRows; i++) {
		generatedBoard[i] = [];
		for(var j = 0; j < numberColumns; j++) {
			generatedBoard[i][j] = {
				isShip: false,
				shipType: ""
			};
		}
	}

	
	// Mbabu add code here that puts ships in the empty board

	// The number of battleships in the game corresponds to the number of players in the game
    for(var i=1; i<playerNumber; i++){
    	generatedBoard.push(generateShip(3, "Cruiser", numberRows, numberColumns, generatedBoard)); 

    }
    
	// Example of changing a cell:
	generatedBoard[9][9].isShip = true;
	generatedBoard[9][9].shipType = "Cruiser";
	console.log("ingeneratedboard");
	return generatedBoard;
}

function generateShip(shipLength, shipType, numberRows, numberColumns, generatedBoard) {
	// Generate random starting cell and direction
	var randomRow = Math.floor((Math.random() * numberRows + 1));
	var randomColumn = Math.floor((Math.random() * numberRows + 1));
	var randomDirection = Math.floor((Math.random() * 4)); // Random direction of four directions: 0 == North, 1 == East, 2 == South, 3 == West
	
	// See if ship can exist in randomly selected spot
	
	// Check if generated start spot is already on an existing ship
	if(Board.findOne({row: randomRow, column: randomColumn}).isShip) {
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
	} else if(randomDirection == 3 && randomColumn - shipLength > 0) { // Flows over west (left) edge, regenerate
		generateShip(shipLength, shipType, numberRows, numberColumns);
		return;
	}
	
	// Check if would occupy spot of existing ship
	if(randomDirection == 0) { // Check northward for length of ship 
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow - i, column: randomColumn}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	} else if(randomDirection == 1) { // Check eastward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow, column: randomColumn + i}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	} else if(randomDirection == 2) { // Check southward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow + i, column: randomColumn}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	} else if(randomDirection == 3) { // Check westward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow, column: randomColumn - i}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	}
	
	// We have now checked that the generated ship does not flow off the board or overlap with any other existing ships.
	// Therefore, place it on the board.
	if(randomDirection == 0) { // Check northward for length of ship 
		for(var i = 0; i < shipLength; i++) {
			Board.update({row: randomRow - i, column: randomColumn});
		}
	} else if(randomDirection == 1) { // Check eastward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow, column: randomColumn + i}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	} else if(randomDirection == 2) { // Check southward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow + i, column: randomColumn}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	} else if(randomDirection == 3) { // Check westward for length of ship
		for(var i = 1; i < shipLength; i++) {
			if(Board.findOne({row: randomRow, column: randomColumn - i}).isShip) {
				generateShip(shipLength, shipType, numberRows, numberColumns);
				return;
			}
		}
	}
}

// Advance to the next turn
// Players have a set time to fire a shot or they forfeit their turn.
var turnTimeout; // Variable for the timeout function
function advanceToNextPlayer() {
	// Set isTurn to false for player who just fired
	Players.update({playerNumber: activePlayerNumber}, {$set: { isTurn: false }});
	
	// Set isTurn to true for next player in sequence
	if(activePlayerNumber == playerNumber - 1) { // Reached last player in sequence; loop to start
		activePlayerNumber = 0;
	} else {
		activePlayerNumber++;
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
			return Board.find();
		});
}
