
const ASSERT = require("assert");
const PASSPORT_FACEBOOK = require("passport-facebook");
const REQUEST = require("request");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

	try {

		ASSERT.equal(typeof config.passport.appID, "string");
		ASSERT.equal(typeof config.passport.appSecret, "string");

	    passport.use(new PASSPORT_FACEBOOK.Strategy({
	    	clientID: config.passport.appID,
		    clientSecret: config.passport.appSecret,
		    callbackURL: config.callbackURL
		}, function(accessToken, refreshToken, profile, done) {
	        return done(null, {
	            "facebook": {
	                "id": ""+profile.id,
	                "displayName": profile.displayName,
	                "accessToken": accessToken
	            }
	        });
	    }));

	    var requester = new REQUESTER();

		return callback(null, {
			passportAuthOptions: function() {
				return {
				    scope: [
				    	"read_friendlists"
				    ]
				};
			},
			fetchContacts: function(passportSession, service, options, callback) {

		    	function ensureUserInfo(callback) {

					return requester(function(callback) {

			    		initOptions.logger.info("[rolodex][facebook] Fetch user info for: " + passportSession.displayName);

						return REQUEST.get({
							url: "https://graph.facebook.com/me?fields=name,username,picture&method=GET&format=json&access_token=" + passportSession.accessToken,
							json: true
						}, function (err, res, user) {
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
									"nickname": user.username || null,
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

							return REQUEST.get({
								url: url || "https://graph.facebook.com/me/friends?fields=name,username,picture&limit=500&method=GET&format=json&access_token=" + passportSession.accessToken,
								json: true
							}, function (err, res, users) {
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
											"nickname": user.username || null,
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
