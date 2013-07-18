
const ASSERT = require("assert");
const PASSPORT_GITHUB = require("passport-github");
const GITHUB = require("github");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

	try {

		if (config.passport) {
			ASSERT.equal(typeof config.passport.clientID, "string");
			ASSERT.equal(typeof config.passport.clientSecret, "string");

		    passport.use(new PASSPORT_GITHUB.Strategy({
		    	clientID: config.passport.clientID,
			    clientSecret: config.passport.clientSecret,
			    callbackURL: config.callbackURL,
			    customHeaders: {
			    	"User-Agent": "NodeJS npm/passport-github"
			    }
			}, function(accessToken, refreshToken, profile, done) {
		        return done(null, {
		            "github": {
		            	"id": profile.id,
		                "username": profile.username,
		                "accessToken": accessToken
		            }
		        });
		    }));
		}

	    function getAPI(passportSession) {

	    	ASSERT.equal(typeof passportSession, "object");

			var github = new GITHUB({
				version: "3.0.0",
				timeout: 5 * 1000
			});

            // Reformat errors.
            github[github.version].sendError = function(err, block, msg, callback) {
				var origErr = err;
                if (typeof origErr == "string") {
                    err = new Error(origErr);
                    err.code = 500;
                } else
                if (typeof origErr === "object" && origErr.message) {
                	if (origErr.code === 401) {
						var err = new Error(origErr.message);
						err.code = "ACCESS_TOKEN_EXPIRED";
                	} else {
                		err = new Error(origErr.message + "(Code: " + origErr.code + ")");
                	}
                }
                if (callback) return callback(err);
            }

			github.authenticate({
			    type: "oauth",
			    token: passportSession.accessToken
			});

			return github;
		}

		var requester = new REQUESTER();

		return callback(null, {
			fetchFullContact: function(passportSession, userId, options, callback) {

	    		var github = getAPI(passportSession);

				return requester(function(callback) {

		    		initOptions.logger.info("[rolodex][github] Fetch user info for: " + userId);

					return github.user.get({
						user: userId
					}, function(err, user) {
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
						return callback(null, {
							"uid": "github:" + user.id,
							"nickname": user.login || null,
							"fn": user.name || null,
							"photo": user.avatar_url || null,
							"email": user.email || null
						});
					});
				}, callback);
			},
			fetchContacts: function(passportSession, service, options, callback) {

	    		var github = getAPI(passportSession);

		    	function ensureUserInfo(callback) {

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

							service.set("hCard", {
								"uid": "github:" + user.id,
								"nickname": user.login || null,
								"fn": user.name || null,
								"photo": user.avatar_url || null
							});
							service.set("contactsTotal", user.following);

							return callback(null);
						});
					}, callback);
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		initOptions.logger.info("[rolodex][github] Fetch contacts for: " + passportSession.username);

		    		var contacts = service.get("contacts");
		    		var existingContacts = {};
		    		for (var contactId in contacts) {
		    			existingContacts[contactId] = true;
		    		}

					service.set("contactsFetched", 0);

		    		if (service.get("contactsTotal") === 0) {
		    			// No contacts to fetch.
			    		for (var contactId in existingContacts) {
			    			delete contacts[contactId];
			    		}
		    			return callback(null);
		    		}

					function processResult(res, callback) {
						try {

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

								contacts[""+user.id] = {
									"uid": "github:" + user.id,
									"nickname": user.login || null,
									"fn": null,
									"photo": user.avatar_url || null
								};
							});

							service.set("contactsFetched", Object.keys(contacts).length);

						} catch(err) {
							initOptions.logger.error("[rolodex][github] res:", res);
							return callback(err);
						}

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
					    			delete contacts[contactId];
					    		}
								service.set("contactsFetched", Object.keys(contacts).length);

								// All done.
								return callback(null);
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
