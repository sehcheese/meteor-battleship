Players = new Mongo.Collection("Players");
Game = new Mongo.Collection("Game");

if (Meteor.isClient) {
	
	Template.body.helpers({
		
	});
	
	// Provides values to the players template
	Template.players.helpers({
		// Return all the players
		players: function () {
			return Players.find({});
		},
		// Return if the game is started or not
		gameBegun: function() {
			return Game.findOne({field: "gameStarted"}).value;
		}
	});
	
	// Handles events from within the players template
	Template.players.events({
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
		
		// Set game as not started
		Game.insert({
			field: "gameStarted",
			value: false
		});
	});
}

// Identifier for players, incremented as they are added.
// Tracks with the current number of players because it starts at 0 and is incremented after each one is added.
var playerNumber = 0;

// Flag indicating whether a player has been added in the last time interval, referenced in periodicStartGameCheck
var playerAdded = false;

var activePlayerNumber;

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
		
		// Player added, should we start the game?
		// There must be at least two players.
		// Once two players are ready to start the game, start a timer to check if anyone joins in a set amount of time since the last player joined.
		// Since this block is run every time a player joins, the timer resets after every new player joins.
		if (Meteor.isServer) { // Only run this check on the server, not the client-side simulation
			if(playerNumber > 1) { // There must be at least two players
				playerAdded = false; // Clear the flag that was just set telling that a player was added. It will be set to true again if a player joins in the given interval.
				Meteor.setTimeout(function() { // After ten seconds check if another player has been added
					if(!playerAdded || playerNumber > 5) { // Player was not added in time interval since last player was added or the max number of players has been reached; start the game.
						// Give the first turn to the first player who joined
						Players.update({playerNumber: 0}, {$set: { isTurn: true }});
						activePlayerNumber = 0;
						
						// Indicate that the game has started
						Game.update({field: "gameStarted"}, {$set: { value: true }});
						
						// Start the turn cycle
						turnCycle();
					}
				}, 10000);
			}
		}
	},
	reset: function() {
		Players.remove({});
		
		Game.remove({});
		
		Game.insert({
			field: "gameStarted",
			value: false
		});
		
		playerNumber = 0;
		playerAdded = false;
	},
	fireShot: function() {
		// Fire shot and do game stuff
		// TODO add code
		
		// Advance to next turn
		
		// Set isTurn to false for player who just fired
		Players.update({playerNumber: activePlayerNumber}, {$set: { isTurn: false }});
		
		// Set isTurn to true for next player in sequence
		if(activePlayerNumber == playerNumber - 1) { // Reached last player in sequence; loop to start
			activePlayerNumber = 0;
		} else {
			activePlayerNumber++;
		}
		Players.update({playerNumber: activePlayerNumber}, {$set: { isTurn: true }});
	}
});

function turnCycle() {
	//console.log("here");
}
