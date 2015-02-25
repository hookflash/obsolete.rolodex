
const ASSERT = require("assert");
const PASSPORT_FACEBOOK = require("passport-facebook");
const REQUEST = require("request");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

	try {

		if (config.passport) {
			ASSERT.equal(typeof config.passport.appID, "string");
			ASSERT.equal(typeof config.passport.appSecret, "string");

		    passport.use(new PASSPORT_FACEBOOK.Strategy({
		    	clientID: config.passport.appID,
			    clientSecret: config.passport.appSecret,
			    callbackURL: config.passport.callbackURL || config.callbackURL
			}, function(accessToken, refreshToken, profile, done) {
		        return done(null, {
		            "facebook": {
		                "id": ""+profile.id,
		                "displayName": profile.displayName,
		                "accessToken": accessToken
		            }
		        });
		    }));
		}

	    var requester = new REQUESTER();

		return callback(null, {
			passportAuthOptions: function() {
				return {
				    scope: [
				    	"user_friends"
				    ]
				};
			},
			fetchContacts: function(passportSession, service, options, callback) {

				// @see https://developers.facebook.com/tools/debug
				function checkForErrors(response, callback) {
					if (response && response.error) {
						var err = null;
						// @see https://developers.facebook.com/docs/reference/api/errors/
						if (response.error.code === 190) {	// OAuthException
							err = new Error(response.error.message + "(Code: " + response.error.code + ", Subcode: " + response.error.error_subcode + ")");
							err.code = "ACCESS_TOKEN_EXPIRED";
						} else {
							err = new Error(response.error.message + "(Code: " + response.error.code + ", Subcode: " + response.error.error_subcode + ")");
						}
						return callback(err);
					}
					return callback(null);
				}

		    	function ensureUserInfo(callback) {

					return requester(function(callback) {

			    		initOptions.logger.info("[rolodex][facebook] Fetch user info for: " + passportSession.displayName);

			    		var url = "https://graph.facebook.com/v2.2/me?fields=name&method=GET&format=json&access_token=" + passportSession.accessToken;

			    		console.log("Call URL:", url);

						return REQUEST.get({
							url: url,
							json: true
						}, function (err, res, user) {
							if (err) return callback(err);
							return checkForErrors(user, function(err) {
								if (err) return callback(err);
								try {
									/*
									{
										name: 'Erik Lagerway',
										id: '691367591',
										username: 'elagerway',
										"picture": {
											"data": {
												"url": "https://fbcdn-profile-a.akamaihd.net/hprofile-ak-ash4/275297_691367591_628492761_q.jpg", 
												"is_silhouette": false
											}
										}
									}
									*/

									service.set("hCard", {
										"uid": "facebook:" + user.id,
										"nickname": user.name || null,
										"fn": user.name || null,
										"photo": (user.picture && user.picture.data && user.picture.data.url) || null
									});
						    		// NOTE: There is no way to fetch number of freinds without listing all firends so we skip setting total.

								} catch(err) {
									initOptions.logger.error("[rolodex][facebook] user:", user);
									return callback(err);
								}

								return callback(null);
							});
						});
					}, callback);
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		initOptions.logger.info("[rolodex][facebook] Fetch contacts for: " + passportSession.displayName);

		    		var contacts = service.get("contacts");
		    		var existingContacts = {};
		    		for (var contactId in contacts) {
		    			existingContacts[contactId] = true;
		    		}

					service.set("contactsFetched", 0);

		    		function fetchPage(url, callback) {

						return requester(function(callback) {

							url = url || "https://graph.facebook.com/v2.2/me/friends?fields=name&limit=500&method=GET&format=json&access_token=" + passportSession.accessToken;

				    		console.log("Call URL:", url);

							return REQUEST.get({
								url: url,
								json: true
							}, function (err, res, users) {
								if (err) return callback(err);
								return checkForErrors(users, function(err) {
									if (err) return callback(err);
									try {
										users.data.forEach(function(user) {
											/*
											{
												name: 'Erik Lagerway',
												id: '691367591',
												username: 'elagerway',
												"picture": {
													"data": {
														"url": "https://fbcdn-profile-a.akamaihd.net/hprofile-ak-ash4/275297_691367591_628492761_q.jpg", 
														"is_silhouette": false
													}
												}
											}
											*/

											delete existingContacts[""+user.id];

											contacts[""+user.id] = {
												"uid": "facebook:" + user.id,
												"nickname": user.name || null,
												"fn": user.name || null,
												"photo": (user.picture && user.picture.data && user.picture.data.url) || null
											};
										});

										var total = Object.keys(contacts).length;
										service.set("contactsFetched", total);
										service.set("contactsTotal", total);

									} catch(err) {
										initOptions.logger.error("[rolodex][facebook] users:", users);
										return callback(err);
									}

									if (users.paging && users.paging.next) {
										return fetchPage(users.paging.next, callback);
									}

									return callback(null);
								});
							});
						}, callback);
		    		}

		    		return fetchPage(null, function(err) {
		    			if (err) return callback(err);

			    		for (var contactId in existingContacts) {
			    			delete contacts[contactId];
			    		}

						var total = Object.keys(contacts).length;
						service.set("contactsFetched", total);
						service.set("contactsTotal", total);

						// All done.
						return callback(null);
		    		});
		    	});
			}
		});

	} catch(err) {
		return callback(err);
	}
}
