
const ASSERT = require("assert");
const PASSPORT_GITHUB = require("passport-github");
const GITHUB = require("github");
const WAITFOR = require("waitfor");


exports.init = function(passport, service, callback) {

	try {

		var config = service._config;

		ASSERT.equal(typeof service._config.passport.clientID, "string");
		ASSERT.equal(typeof service._config.passport.clientSecret, "string");

	    passport.use(new PASSPORT_GITHUB.Strategy({
	    	clientID: service._config.passport.clientID,
		    clientSecret: service._config.passport.clientSecret,
		    callbackURL: service._callbackURL
		}, function(accessToken, refreshToken, profile, done) {
	        return done(null, {
	            "github": {
	                "id": profile.id,
	                "email": profile.emails[0].value,
	                "username": profile.username,
	                "accessToken": accessToken
	            }
	        });
	    }));

	    service.__proto__._fetchContacts = function(done) {
    		if (service.fetching) return done(null);
    		function callback(err) {
    			service.fetching = false;
    			return done.apply(null, arguments);
    		}
	    	try {

		    	ASSERT.equal(typeof service._passportSession, "object");

		    	service.fetching = true;

				var github = new GITHUB({
					version: "3.0.0",
					timeout: 5 * 1000
				});
				github.authenticate({
				    type: "oauth",
				    token: service._passportSession.accessToken
				});

				var contacts = [];

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
						contacts.push(user.login);
					});

					if (!github.hasNextPage(res)) {
						return callback(null);
					}
					return github.getNextPage(res, function(err, res) {
						if (err) return callback(err);
						return processResult(res, callback);
					});
				}
				return github.user.getFollowing({
					per_page: "10"
				}, function(err, res) {
					if (err) return callback(err);
					return processResult(res, function(err) {
						if (err) return callback(err);

						var waitfor = WAITFOR.serial(callback);

						contacts.forEach(function(contact) {

							waitfor(function(done) {

								return github.user.getFrom({
									user: contact
								}, function(err, user) {
									if (err) return done(err);
									/*
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
									*/

									service._contacts[user.login] = {
										"service": "github",
										"alias": user.login,
										"name": user.name,
										"email": user.email
									}
									return done(null);
								});
							});
						});
						return waitfor();
					});
				});
			} catch(err) {
				return callback(err);
			}
	    }

		return callback(null);

	} catch(err) {
		return callback(err);
	}
}
