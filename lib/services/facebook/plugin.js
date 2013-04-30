
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

		    		// There is no way to fetch number of freinds without listing all firends.

					var firstLoad = (service.userID === null) ? true : false;

					service.userID = passportSession.id;

					if (firstLoad) {
						return service.load(function(err) {
							if (err) return callback(err);

				    		// We assume that if we have contacts in cache we have all of them.
							service.contactsTotal = service.contactsFetched;

							return callback(err);
						});
					} else {
						return callback(null);
					}
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		if (
		    			service.contactsTotal > 0 &&
		    			service.contactsFetched === service.contactsTotal &&
		    			options.refetch !== true
		    		) return callback(null);

		    		initOptions.logger.info("[rolodex][facebook] Fetch contacts for: " + passportSession.displayName);

		    		var existingContacts = {};
		    		for (var contactId in service.contacts) {
		    			existingContacts[contactId] = true;
		    		}

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

										service.contacts[""+user.id] = {
											"alias": user.username || null,
											"display": user.name || null,
											"image": (user.picture && user.picture.data && user.picture.data.url) || null
										};
									});

									service.contactsTotal = service.contactsFetched = Object.keys(service.contacts).length;
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
		    		}

		    		return fetchPage(null, function(err) {
		    			if (err) return callback(err);

			    		for (var contactId in existingContacts) {
			    			delete service.contacts[contactId];
			    		}
						service.contactsFetched = Object.keys(service.contacts).length;

						if (service.contactsFetched !== service.contactsTotal) {
							initOptions.logger.warn("[rolodex][facebook] ERROR: `contactsFetched` (" + service.contactsFetched + ") != `contactsTotal` (" + service.contactsTotal + ")");
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
