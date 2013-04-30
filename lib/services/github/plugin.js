
const ASSERT = require("assert");
const PASSPORT_GITHUB = require("passport-github");
const GITHUB = require("github");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

	try {

		ASSERT.equal(typeof config.passport.clientID, "string");
		ASSERT.equal(typeof config.passport.clientSecret, "string");

	    passport.use(new PASSPORT_GITHUB.Strategy({
	    	clientID: config.passport.clientID,
		    clientSecret: config.passport.clientSecret,
		    callbackURL: config.callbackURL
		}, function(accessToken, refreshToken, profile, done) {
	        return done(null, {
	            "github": {
	            	"id": profile.id,
	                "username": profile.username,
	                "accessToken": accessToken
	            }
	        });
	    }));

	    function getAPI(passportSession) {

	    	ASSERT.equal(typeof passportSession, "object");

			var github = new GITHUB({
				version: "3.0.0",
				timeout: 5 * 1000
			});
			github.authenticate({
			    type: "oauth",
			    token: passportSession.accessToken
			});

			return github;
		}

		var requester = new REQUESTER();

		return callback(null, {
			fetchContacts: function(passportSession, service, options, done) {
	    		if (service.fetching) return done(null);

	    		if (service.contactsTotal > 0 && options.refetch !== true) return done(null);

	    		function callback(err) {
	    			service.fetching = false;
	    			return done.apply(null, arguments);
	    		}

	    		var github = getAPI(passportSession);

		    	service.fetching = true;

		    	function ensureUserInfo(callback) {
		    		if (service.userID !== null && options.refetch !== true) {
		    			return callback(null);
		    		}

					return requester(function(callback) {

			    		initOptions.logger.info("[rolodex][github] Fetch user info for: " + passportSession.username);

						return github.user.get({}, function(err, user) {
							if (err) return callback(err);
							/*
							{
							    "login": "cadorn",
							    "id": 18679,
							    "avatar_url": "https://secure.gravatar.com/avatar/3a5539ba54c87e6571d5801c5dd43ccc?d=https://a248.e.akamai.net/assets.github.com%2Fimages%2Fgravatars%2Fgravatar-user-420.png",
							    "gravatar_id": "3a5539ba54c87e6571d5801c5dd43ccc",
							    "url": "https://api.github.com/users/cadorn",
							    "html_url": "https://github.com/cadorn",
							    "followers_url": "https://api.github.com/users/cadorn/followers",
							    "following_url": "https://api.github.com/users/cadorn/following",
							    "gists_url": "https://api.github.com/users/cadorn/gists{/gist_id}",
							    "starred_url": "https://api.github.com/users/cadorn/starred{/owner}{/repo}",
							    "subscriptions_url": "https://api.github.com/users/cadorn/subscriptions",
							    "organizations_url": "https://api.github.com/users/cadorn/orgs",
							    "repos_url": "https://api.github.com/users/cadorn/repos",
							    "events_url": "https://api.github.com/users/cadorn/events{/privacy}",
							    "received_events_url": "https://api.github.com/users/cadorn/received_events",
							    "type": "User",
							    "name": "Christoph Dorn",
							    "company": "",
							    "blog": "http://ChristophDorn.com",
							    "location": "Canada",
							    "email": "christoph@christophdorn.com",
							    "hireable": true,
							    "bio": "",
							    "public_repos": 76,
							    "followers": 69,
							    "following": 13,
							    "created_at": "2008-07-28T14:16:20Z",
							    "updated_at": "2013-04-26T16:57:57Z",
							    "public_gists": 18,
							    "meta": {
							        "x-ratelimit-limit": "5000",
							        "x-ratelimit-remaining": "4992"
							    }
							}
							*/

							// TODO: Add this as a full contact.

							var firstLoad = (service.userID === null) ? true : false;

							service.userID = "" + user.id;
							service.contactsTotal = user.following;

							if (firstLoad) {
								return service.load(callback);
							} else {
								return callback(null);
							}
						});
					}, callback);
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		if (service.contactsFetched === service.contactsTotal && options.refetch !== true) return callback(null);

		    		initOptions.logger.info("[rolodex][github] Fetch contacts for: " + passportSession.username);

		    		var existingContacts = {};
		    		for (var contactId in service.contacts) {
		    			existingContacts[contactId] = true;
		    		}

					function processResult(res, callback) {

						res.forEach(function(user) {
							/*
							{
							    "login": "LawrenceGunn",
							    "id": 689166,
							    "avatar_url": "https://secure.gravatar.com/avatar/c812a2a87bfa2f251a23b9bcda130607?d=https://a248.e.akamai.net/assets.github.com%2Fimages%2Fgravatars%2Fgravatar-user-420.png",
							    "gravatar_id": "c812a2a87bfa2f251a23b9bcda130607",
							    "url": "https://api.github.com/users/LawrenceGunn",
							    "html_url": "https://github.com/LawrenceGunn",
							    "followers_url": "https://api.github.com/users/LawrenceGunn/followers",
							    "following_url": "https://api.github.com/users/LawrenceGunn/following",
							    "gists_url": "https://api.github.com/users/LawrenceGunn/gists{/gist_id}",
							    "starred_url": "https://api.github.com/users/LawrenceGunn/starred{/owner}{/repo}",
							    "subscriptions_url": "https://api.github.com/users/LawrenceGunn/subscriptions",
							    "organizations_url": "https://api.github.com/users/LawrenceGunn/orgs",
							    "repos_url": "https://api.github.com/users/LawrenceGunn/repos",
							    "events_url": "https://api.github.com/users/LawrenceGunn/events{/privacy}",
							    "received_events_url": "https://api.github.com/users/LawrenceGunn/received_events",
							    "type": "User"
							}
							*/

							delete existingContacts[""+user.id];

							service.contacts[""+user.id] = {
								"alias": user.login || null,
								"display": null,
								"image": user.avatar_url || null
							};
						});

						service.contactsFetched = Object.keys(service.contacts).length;

						if (github.hasNextPage(res)) {
							return requester(function(callback) {
								return github.getNextPage(res, function(err, res) {
									if (err) return callback(err);
									return processResult(res, callback);
								});
							}, callback);
						}

						return callback(null);
					}

					return requester(function(callback) {
						return github.user.getFollowing({
							per_page: "100"
						}, function(err, res) {
							if (err) return callback(err);
							return processResult(res, function(err) {
								if (err) return callback(err);

					    		for (var contactId in existingContacts) {
					    			delete service.contacts[contactId];
					    		}
								service.contactsFetched = Object.keys(service.contacts).length;

								if (service.contactsFetched !== service.contactsTotal) {
									initOptions.logger.warn("[rolodex][github] ERROR: `contactsFetched` (" + service.contactsFetched + ") != `contactsTotal` (" + service.contactsTotal + ")");
								}

								return service.save(function(err) {
									if (err) return callback(err);

									// All done.
									return callback(null);
								});
							});
						});
					}, callback);
				});
			}
		});

		/*
		var fetchFields = {
			"alias": "login",
			"name": "name",
			"email": "email"
		};

		// Don't fetch again if all fields have already been fetched.
		if (service._contacts[contact]) {
			var allFieldsFound = true;
			for (var targetName in fetchFields) {
				if (typeof service._contacts[contact][targetName] === "undefined") {
					allFieldsFound = false;
				}
			}
			if (allFieldsFound) return
		}

		return github.user.getFrom({
			user: contact
		}, function(err, user) {
			if (err) return done(err);
			{
			    "login": "zaach",
			    "id": 3903,
			    "avatar_url": "https://secure.gravatar.com/avatar/a7657b2354d983b2c8db0d6226d1ce20?d=https://a248.e.akamai.net/assets.github.com%2Fimages%2Fgravatars%2Fgravatar-user-420.png",
			    "gravatar_id": "a7657b2354d983b2c8db0d6226d1ce20",
			    "url": "https://api.github.com/users/zaach",
			    "html_url": "https://github.com/zaach",
			    "followers_url": "https://api.github.com/users/zaach/followers",
			    "following_url": "https://api.github.com/users/zaach/following",
			    "gists_url": "https://api.github.com/users/zaach/gists{/gist_id}",
			    "starred_url": "https://api.github.com/users/zaach/starred{/owner}{/repo}",
			    "subscriptions_url": "https://api.github.com/users/zaach/subscriptions",
			    "organizations_url": "https://api.github.com/users/zaach/orgs",
			    "repos_url": "https://api.github.com/users/zaach/repos",
			    "events_url": "https://api.github.com/users/zaach/events{/privacy}",
			    "received_events_url": "https://api.github.com/users/zaach/received_events",
			    "type": "User",
			    "name": "Zach Carter",
			    "company": "Mozilla",
			    "blog": "twitter.com/zii",
			    "location": "San Francisco, CA",
			    "email": "zcarter@mozilla.com",
			    "hireable": false,
			    "bio": null,
			    "public_repos": 52,
			    "followers": 177,
			    "following": 42,
			    "created_at": "2008-03-26T15:01:36Z",
			    "updated_at": "2013-04-25T14:29:58Z",
			    "public_gists": 59
			}

			if (!service._contacts[contact]) {
				service._contacts[contact] = {};
			}

			for (var targetName in fetchFields) {
				service._contacts[contact][targetName] = user[fetchFields[targetName]];
			}

			service.stats.fetchedContacts = Object.keys(service._contacts).length;

			return done(null);
		});
	    */

	} catch(err) {
		return callback(err);
	}
}
