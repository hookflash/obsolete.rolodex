
const ASSERT = require("assert");
const PASSPORT_LINKEDIN = require("passport-linkedin");
const REQUEST = require("request");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

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

	    var requester = new REQUESTER();

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
		    		if (service.hCard !== null && options.refetch !== true) {
		    			return callback(null);
		    		}
		    		return requester(function(callback) {

			    		initOptions.logger.info("[rolodex][linkedin] Fetch user info for: " + passportSession.displayName);

			    		var url = "http://api.linkedin.com/v1/people/~:(id,formatted-name,num-connections,num-connections-capped,picture-url)";

		    			initOptions.logger.debug("[rolodex][linkedin] fetch:", url);

						return REQUEST.get({
							url: url,
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
							try {
								/*
								{
									formattedName: 'Christoph Dorn',
									id: 'z06MtaTJmE',
									numConnections: 104,
									// Allows you to distinguish whether num-connections = 500 because the member has exactly 500 connections or actually 500+ because we're hiding the true value.
									numConnectionsCapped: false,
									pictureUrl: 'http://m3.licdn.com/mpr/mprx/0_IyKoXmF932tqIwRDShs7373js'
								}						
								*/

								// TODO: Add this as a full contact.

								var firstLoad = (service.hCard === null) ? true : false;

								service.hCard = {
									"uid": "linkedin:" + user.id,
									"nickname": null,
									"fn": user.formattedName || null,
									"photo": user.pictureUrl || null
								};
								service.contactsTotal = user.numConnections;

				    			initOptions.logger.debug("[rolodex][linkedin] service.contactsTotal:", service.contactsTotal);

							} catch(err) {
								initOptions.logger.error("[rolodex][linkedin] user:", user);
								return callback(err);
							}

							if (firstLoad) {
								return service.load(function(err) {
									if (err) return callback(err);

									if (service.contactsFetched > service.contactsTotal) {
										service.contactsTotal = service.contactsFetched;
									}

									return callback(null);
								});
							} else {
								return callback(null);
							}
						});
		    		}, callback);
		    	}

		    	return ensureUserInfo(function(err) {

		    		if (err) return callback(err);

		    		if (
		    			(service.contactsFetched + service.contactsDropped) === service.contactsTotal &&
		    			options.refetch !== true
		    		) return callback(null);

		    		initOptions.logger.info("[rolodex][linkedin] Fetch contacts for: " + passportSession.displayName);

		    		var existingContacts = {};
		    		for (var contactId in service.contacts) {
		    			existingContacts[contactId] = true;
		    		}

					service.contactsDropped = 0;
					var updatedTotal = false;

		    		function fetchPage(start, callback) {

			    		return requester(function(callback) {

			    			var url = "http://api.linkedin.com/v1/people/~/connections:(id,formatted-name,picture-url)?start=" + start + "&count=500";

			    			initOptions.logger.debug("[rolodex][linkedin] fetch:", url);

							return REQUEST.get({
								url: url,
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

								try {

					    			if (!users.values) throw new Error("No `users.values` returned");

									if (!updatedTotal && typeof users._total !== "undefined") {
										updatedTotal = true;
										service.contactsTotal = users._total || 0;
									}

					    			initOptions.logger.debug("[rolodex][linkedin] service.contactsTotal:", service.contactsTotal);

									users.values.forEach(function(user) {
										/*
										{
											formattedName: 'Jane Smith',
											// This field might return a value of private for users other than the currently logged-in user depending on the member's privacy settings
											id: 'HuQwo-xYQj',
											pictureUrl: 'http://m3.licdn.com/mpr/mprx/0_IyKoXmF932tqIwRDShs7373js'
										}
										*/

										if (user.id === "private") {
											service.contactsDropped += 1;
											return;
										}

										// Sometimes linkedin returns the same contact twice.
										if (!existingContacts[user.id] && service.contacts[user.id]) {
											service.contactsTotal -= 1;
											return;
										}

										delete existingContacts[user.id];

										service.contacts[user.id] = {
											"uid": "linkedin:" + user.id,
											"nickname": null,
											"fn": user.formattedName || null,
											"photo": user.pictureUrl || null
										};
									});

									service.contactsFetched = Object.keys(service.contacts).length;

					    			initOptions.logger.debug("[rolodex][linkedin] service.contactsFetched:", service.contactsFetched);
					    			initOptions.logger.debug("[rolodex][linkedin] service.contactsDropped:", service.contactsDropped);

								} catch(err) {
									initOptions.logger.error("[rolodex][linkedin] users:", users);
									return callback(err);
								}

								if ((users._start + users._count) < users._total) {
									return fetchPage(users._start + users._count, callback);
								}

								return callback(null);
							});
						}, callback);
		    		}

		    		return fetchPage(0, function(err) {
		    			if (err) return callback(err);

			    		for (var contactId in existingContacts) {
			    			delete service.contacts[contactId];
			    		}
						service.contactsFetched = Object.keys(service.contacts).length;

						if ((service.contactsFetched + service.contactsDropped) !== service.contactsTotal) {
							initOptions.logger.warn("[rolodex][linkedin] ERROR: `contactsFetched` (" + service.contactsFetched + ") + `contactsDropped` (" + service.contactsDropped + ") != `contactsTotal` (" + service.contactsTotal + ")");
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
