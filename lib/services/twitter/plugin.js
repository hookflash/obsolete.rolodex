
const ASSERT = require("assert");
const PASSPORT_TWITTER = require("passport-twitter");


exports.init = function(rolodex, passport, config, options, callback) {

	try {

		ASSERT.equal(typeof config.passport.consumerKey, "string");
		ASSERT.equal(typeof config.passport.consumerSecret, "string");

	    passport.use(new PASSPORT_TWITTER.Strategy({
	    	consumerKey: config.passport.consumerKey,
		    consumerSecret: config.passport.consumerSecret,
		    callbackURL: config.callbackURL
		}, function(accessToken, refreshToken, profile, done) {
	        return done(null, {
	            "twitter": {
	                "id": profile.id,
	                "username": profile.username,
	                "accessToken": accessToken
	            }
	        });
	    }));

	    function getAPI(passportSession) {
/*
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
*/
		}

		return callback(null, {
			fetchContacts: function(passportSession, service, options, done) {

return done(null);

	    		if (service.fetching) return done(null);

	    		if (service.contactsTotal > 0 && options.refetch !== true) return done(null);

	    		function callback(err) {
	    			service.fetching = false;
	    			return done.apply(null, arguments);
	    		}

	    		var github = getAPI(passportSession);

		    	service.fetching = true;

		    	function ensureUserInfo(callback) {
		    		if (service.username !== null && options.refetch !== true) {
		    			return callback(null);
		    		}
		    		console.log("[rolodex][github] Fetch user info for: " + passportSession.username);
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

						var firstLoad = (service.username === null) ? true : false;

						service.username = user.login;
						service.contactsTotal = user.following;

						if (firstLoad) {
							return service.load(callback);
						} else {
							return callback(null);
						}
					});
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		if (service.contactsFetched === service.contactsTotal && options.refetch !== true) return callback(null);

		    		console.log("[rolodex][github] Fetch contacts for: " + service.username);

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
							service.contacts[user.login] = {
								"gravatar_id": user.gravatar_id
							};
							delete existingContacts[user.login];
						});

						service.contactsFetched = Object.keys(service.contacts).length;

						if (!github.hasNextPage(res)) {
							return callback(null);
						}
						return github.getNextPage(res, function(err, res) {
							if (err) return callback(err);
							return processResult(res, callback);
						});
					}
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
								console.warn("[rolodex][github] ERROR: `contactsFetched` (" + service.contactsFetched + ") != `contactsTotal` (" + service.contactsTotal + ")");
							}

							return service.save(function(err) {
								if (err) return callback(err);

								// All done.
								return callback(null);
							});
						});
					});
				});
			}
		});

	} catch(err) {
		return callback(err);
	}
}
