
const ASSERT = require("assert");
const PASSPORT_LINKEDIN = require("passport-linkedin");
const REQUEST = require("request");


exports.init = function(rolodex, passport, config, options, callback) {

	try {

		ASSERT.equal(typeof config.passport.apiKey, "string");
		ASSERT.equal(typeof config.passport.secretKey, "string");

	    passport.use(new PASSPORT_LINKEDIN.Strategy({
	    	consumerKey: config.passport.apiKey,
		    consumerSecret: config.passport.secretKey,
		    callbackURL: config.callbackURL
		}, function(accessToken, accessTokenSecret, profile, done) {
	        return done(null, {
	            "linkedin": {
	                "id": profile.id,
	                "displayName": profile.displayName,
	                "accessToken": accessToken,
	                "accessTokenSecret": accessTokenSecret
	            }
	        });
	    }));

		return callback(null, {
			passportAuthOptions: function() {
				return {
				    scope: [
				    	"r_basicprofile",
				    	"r_network"
				    ]
				};
			},
			fetchContacts: function(passportSession, service, options, done) {

	    		if (service.fetching) return done(null);

	    		if (service.contactsTotal > 0 && options.refetch !== true) return done(null);

	    		function callback(err) {
	    			service.fetching = false;
	    			return done.apply(null, arguments);
	    		}

		    	service.fetching = true;

		    	function ensureUserInfo(callback) {
		    		if (service.userID !== null && options.refetch !== true) {
		    			return callback(null);
		    		}
		    		console.log("[rolodex][linkedin] Fetch user info for: " + passportSession.displayName);

					return REQUEST.get({
						url: "http://api.linkedin.com/v1/people/~:(id,formatted-name,num-connections,num-connections-capped)",
						oauth: {
							consumer_key: config.passport.apiKey,
					        consumer_secret: config.passport.secretKey,
					        token: passportSession.accessToken,
					        token_secret: passportSession.accessTokenSecret
				        },
				        headers: {
				        	"x-li-format": "json"
				        },
						json: true
					}, function (err, res, user) {
						if (err) return callback(err);

						/*
						{
							formattedName: 'Christoph Dorn',
							id: 'z06MtaTJmE',
							numConnections: 104,
							// Allows you to distinguish whether num-connections = 500 because the member has exactly 500 connections or actually 500+ because we're hiding the true value.
							numConnectionsCapped: false
						}						
						*/

						// TODO: Add this as a full contact.

						var firstLoad = (service.userID === null) ? true : false;

						service.userID = user.id;
						service.contactsTotal = user.numConnections;
						if (user.numConnectionsCapped) {
							service.contactsTotalCapped = true;
						}

						if (firstLoad) {
							return service.load(callback);
						} else {
							return callback(null);
						}
					});
		    	}

		    	return ensureUserInfo(function(err) {

		    		if (err) return callback(err);

		    		if (
		    			(service.contactsFetched + service.contactsDropped) === service.contactsTotal &&
		    			service.contactsTotalCapped !== true &&
		    			options.refetch !== true
		    		) return callback(null);

		    		console.log("[rolodex][linkedin] Fetch contacts for: " + passportSession.displayName);

		    		var existingContacts = {};
		    		for (var contactId in service.contacts) {
		    			existingContacts[contactId] = true;
		    		}

					service.contactsDropped = 0;

		    		function fetchPage(start, callback) {

						return REQUEST.get({
							url: "http://api.linkedin.com/v1/people/~/connections:(id,formatted-name,picture-url)?start=" + start + "&count=50",
							oauth: {
								consumer_key: config.passport.apiKey,
						        consumer_secret: config.passport.secretKey,
						        token: passportSession.accessToken,
						        token_secret: passportSession.accessTokenSecret
					        },
					        headers: {
					        	"x-li-format": "json"
					        },
							json: true
						}, function (err, res, users) {
							if (err) return callback(err);

console.log("[rolodex][linkedin] users._total:", users._total);
							try {

								users.values.forEach(function(user) {
									/*
									{
										formattedName: 'Jane Smith',
										// This field might return a value of private for users other than the currently logged-in user depending on the member's privacy settings
										id: 'HuQwo-xYQj',
										pictureUrl: 'http://m3.licdn.com/mpr/mprx/0_IyKoXmF932tqIwRDShs7373js'
									}
									*/

									delete existingContacts[user.id];

									if (user.id === "private") {
										service.contactsDropped += 1;
										return;
									}

									service.contacts[user.id] = {
										"display": user.formattedName,
										"image": user.pictureUrl || null
									};
								});

								service.contactsFetched = Object.keys(service.contacts).length;
							} catch(err) {
								console.error("[rolodex][linkedin] users:", users);
								return callback(err);
							}

							if ((users._start + users._count) < users._total) {
								return fetchPage(users._start + users._count, callback);
							}

							return callback(null);
						});
		    		}

		    		return fetchPage(0, function(err) {
		    			if (err) return callback(err);

			    		for (var contactId in existingContacts) {
			    			delete service.contacts[contactId];
			    		}

						return service.save(function(err) {
							if (err) return callback(err);

							// All done.
							return callback(null);
						});		    			
		    		});
				});
			}
		});

	} catch(err) {
		return callback(err);
	}
}
