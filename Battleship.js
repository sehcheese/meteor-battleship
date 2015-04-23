Players = new Mongo.Collection("Players");
Game = new Mongo.Collection("Game");
Board = new Mongo.Collection("Board");

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
	
	Template.fireShot.events({
		'click #fire_shot': function() {
			Meteor.call("fireShot");
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
		var numberRows = Game.findOne({field: "board"}).numberRows;
		var numberColumns = Game.findOne({field: "board"}).numberColumns;
		
		for(var i = 0; i < numberRows; i++) {
			tableHtml += "<tr>";
			for(var j = 0; j < numberColumns; j++) {
				tableHtml += '<td data-row="' + i + '" data-col="' + j + '"></td>'
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
		if(!initialized) {
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
				numberRows: 10,
				numberColumns: 10
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
		// Initialize ship layout for this player
		// Receive 2D array of objects representing the player's board
		// This 2D array will be used to update the global board
		var playerBoard = generateBoardForPlayer();
		
		var numberRows = Game.findOne({field: "board"}).numberRows;
		var numberColumns = Game.findOne({field: "board"}).numberColumns;
		
		// For each cell, if there is a ship add it to the board
		for(var i = 0; i < numberRows; i++) {
			for(var j = 0; j < numberColumns; j++) {
				if(playerBoard[i][j].isShip) { // If player's generated board contains a ship at this spot, update the global board
					Board.update({row: i, column: j}, {$set: { 
						isShip: true, 
						shipOwner: Meteor.userId(), 
						shipType: playerBoard[i][j].shipType
					}});
					
					if(Meteor.isClient) {
						console.log(i + " | " + j);
						$('td[data-row="' + i + '"][data-col="' + j + '"]').addClass("unhit-ship-cell");
					}
				}
			}
		}
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
	// Example of changing a cell:
	generatedBoard[1][1].isShip = true;
	generatedBoard[1][1].shipType = "Cruiser";
	
	return generatedBoard;
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
