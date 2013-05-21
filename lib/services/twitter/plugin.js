
const ASSERT = require("assert");
const PASSPORT_TWITTER = require("passport-twitter");
const REQUEST = require("request");
const REQUESTER = require("../../requester");


exports.init = function(rolodex, passport, config, initOptions, callback) {

	try {

		ASSERT.equal(typeof config.passport.consumerKey, "string");
		ASSERT.equal(typeof config.passport.consumerSecret, "string");

	    passport.use(new PASSPORT_TWITTER.Strategy({
	    	consumerKey: config.passport.consumerKey,
		    consumerSecret: config.passport.consumerSecret,
		    callbackURL: config.callbackURL
		}, function(accessToken, accessTokenSecret, profile, done) {
	        return done(null, {
	            "twitter": {
	                "id": profile.id,
	                "username": profile.username,
	                "accessToken": accessToken,
	                "accessTokenSecret": accessTokenSecret
	            }
	        });
	    }));

	    var requester = new REQUESTER();

		return callback(null, {
			fetchContacts: function(passportSession, service, options, callback) {

				function checkForErrors(response, callback) {
					var err = null;
					if (
						response &&
						response.errors &&
						Array.isArray(response.errors) &&
						response.errors.length > 0
					) {
						response.errors.forEach(function(error) {
							if (err) return;
							// @see https://dev.twitter.com/docs/error-codes-responses
							if (error.code === 89) {	// Invalid or expired token
								err = new Error(error.message);
								err.code = "ACCESS_TOKEN_EXPIRED";
							} else {
								err = new Error(error.message + "(Code: " + error.code + ")");
							}
						});
					}
					if (err) return callback(err);
					return callback(null);
				}

		    	function ensureUserInfo(callback) {

		    		return requester(function(callback) {

			    		initOptions.logger.info("[rolodex][twitter] Fetch user info for: " + passportSession.username);

						return REQUEST.get({
							url: "https://api.twitter.com/1.1/users/show.json?user_id=" + passportSession.id,
							oauth: {
								consumer_key: config.passport.consumerKey,
						        consumer_secret: config.passport.consumerSecret,
						        token: passportSession.accessToken,
						        token_secret: passportSession.accessTokenSecret
					        },
							json: true
						}, function (err, res, user) {
							if (err) return callback(err);
							return checkForErrors(user, function(err) {
								if (err) return callback(err);
								try {
									/*
									{
									  "profile_sidebar_fill_color": "F8FCF2",
									  "profile_sidebar_border_color": "547980",
									  "profile_background_tile": true,
									  "name": "Ryan Sarver",
									  "profile_image_url": "http://a0.twimg.com/profile_images/1777569006/image1327396628_normal.png",
									  "created_at": "Mon Feb 26 18:05:55 +0000 2007",
									  "location": "San Francisco, CA",
									  "follow_request_sent": false,
									  "profile_link_color": "547980",
									  "is_translator": false,
									  "id_str": "795649",
									  "default_profile": false,
									  "contributors_enabled": true,
									  "favourites_count": 3162,
									  "url": null,
									  "profile_image_url_https": "https://si0.twimg.com/profile_images/1777569006/image1327396628_normal.png",
									  "utc_offset": -28800,
									  "id": 795649,
									  "profile_use_background_image": true,
									  "listed_count": 1586,
									  "profile_text_color": "594F4F",
									  "lang": "en",
									  "followers_count": 276334,
									  "protected": false,
									  "notifications": true,
									  "profile_background_image_url_https": "https://si0.twimg.com/profile_background_images/113854313/xa60e82408188860c483d73444d53e21.png",
									  "profile_background_color": "45ADA8",
									  "verified": false,
									  "geo_enabled": true,
									  "time_zone": "Pacific Time (US & Canada)",
									  "description": "Director, Platform at Twitter. Detroit and Boston export. Foodie and over-the-hill hockey player. @devon's lesser half",
									  "default_profile_image": false,
									  "profile_background_image_url": "http://a0.twimg.com/profile_background_images/113854313/xa60e82408188860c483d73444d53e21.png",
									  "status": {
									    "coordinates": null,
									    "favorited": false,
									    "truncated": false,
									    "created_at": "Sat Aug 25 19:33:11 +0000 2012",
									    "retweeted_status": {
									      "coordinates": null,
									      "favorited": false,
									      "truncated": false,
									      "created_at": "Sat Aug 25 19:20:36 +0000 2012",
									      "id_str": "239442171466493953",
									      "entities": {
									        "urls": [
									          {
									            "expanded_url": "http://nbcnews.to/NtkRTJ",
									            "url": "http://t.co/f8ivBrVd",
									            "indices": [
									              102,
									              122
									            ],
									            "display_url": "nbcnews.to/NtkRTJ"
									          }
									        ],
									        "hashtags": [
									 
									        ],
									        "user_mentions": [
									 
									        ]
									      },
									      "in_reply_to_user_id_str": null,
									      "contributors": null,
									      "text": "Neil Armstrong has died at the age of 82 from complications from heart operations he had 3 weeks ago. http://t.co/f8ivBrVd",
									      "retweet_count": 112,
									      "in_reply_to_status_id_str": null,
									      "id": 239442171466493953,
									      "geo": null,
									      "retweeted": false,
									      "possibly_sensitive": false,
									      "in_reply_to_user_id": null,
									      "place": null,
									      "in_reply_to_screen_name": null,
									      "source": "web",
									      "in_reply_to_status_id": null
									    },
									    "id_str": "239445335481647105",
									    "entities": {
									      "urls": [
									        {
									          "expanded_url": "http://nbcnews.to/NtkRTJ",
									          "url": "http://t.co/f8ivBrVd",
									          "indices": [
									            115,
									            135
									          ],
									          "display_url": "nbcnews.to/NtkRTJ"
									        }
									      ],
									      "hashtags": [
									 
									      ],
									      "user_mentions": [
									        {
									          "name": "NBC News",
									          "id_str": "14173315",
									          "id": 14173315,
									          "indices": [
									            3,
									            11
									          ],
									          "screen_name": "NBCNews"
									        }
									      ]
									    },
									    "in_reply_to_user_id_str": null,
									    "contributors": null,
									    "text": "RT @NBCNews: Neil Armstrong has died at the age of 82 from complications from heart operations he had 3 weeks ago. http://t.co/f8ivBrVd",
									    "retweet_count": 112,
									    "in_reply_to_status_id_str": null,
									    "id": 239445335481647105,
									    "geo": null,
									    "retweeted": false,
									    "possibly_sensitive": false,
									    "in_reply_to_user_id": null,
									    "place": null,
									    "in_reply_to_screen_name": null,
									    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter for  iPhone</a>",
									    "in_reply_to_status_id": null
									  },
									  "statuses_count": 13728,
									  "friends_count": 1780,
									  "following": true,
									  "show_all_inline_media": true,
									  "screen_name": "rsarver"
									}
									*/

									// TODO: Add this as a full contact.

									service.set("hCard", {
										"uid": "twitter:" + user.id,
										"nickname": user.screen_name || null,
										"fn": user.name || null,
										"photo": user.profile_image_url || null
									});
									service.set("contactsTotal", user.friends_count);

								} catch(err) {
									initOptions.logger.error("[rolodex][twitter] user:", user);
									return callback(err);
								}

								return callback(null);
							});
						});
					}, callback);
		    	}

		    	return ensureUserInfo(function(err) {
		    		if (err) return callback(err);

		    		initOptions.logger.info("[rolodex][twitter] Fetch contacts for: " + passportSession.username);

		    		var contacts = service.get("contacts");
		    		var existingContacts = {};
		    		for (var contactId in contacts) {
		    			existingContacts[contactId] = true;
		    		}

					service.set("contactsFetched", 0);

		    		var ids = [];

		    		function fetchIDs(cursor, callback) {

			    		if (service.get("contactsTotal") === 0) {
			    			// No contacts to fetch.
			    			return callback(null);
			    		}

			    		return requester(function(callback) {

			    			var url = "https://api.twitter.com/1.1/friends/ids.json?user_id=" + passportSession.id + "&cursor=" + cursor + "&stringify_ids=true&count=5000";

			    			initOptions.logger.debug("[rolodex][twitter] fetch:", url);

							return REQUEST.get({
								url: url,
								oauth: {
									consumer_key: config.passport.consumerKey,
							        consumer_secret: config.passport.consumerSecret,
							        token: passportSession.accessToken,
							        token_secret: passportSession.accessTokenSecret
						        },
								json: true
							}, function (err, res, data) {
								if (err) return callback(err);
								return checkForErrors(data, function(err) {
									if (err) return callback(err);
									/*
									{
										"previous_cursor": 0,
										"ids": [
											"657693",
											"183709371",
											"7588892"
										],
										"previous_cursor_str": "0",
										"next_cursor": 0,
										"next_cursor_str": "0"
									}
									*/
									try {

						    			if (!data.ids) throw new Error("No `data.ids` returned");

						    			ids = ids.concat(data.ids);

										options.logger.debug("[rolodex][twitter] ids.length:", ids.length);

									} catch(err) {
										options.logger.error("[rolodex][twitter] data:", data);
										return callback(err);
									}

									if (data.next_cursor) {
										return fetchIDs(data.next_cursor, callback);
									}

									return callback(null);
								});
							});
						}, callback);
		    		}

		    		function fetchUsers(callback) {

			    		return requester(function(callback) {

			    			var fetchIDs = [];
			    			var id;
			    			while(ids.length > 0) {
			    				id = ids.pop();
			    				if (existingContacts[""+id]) {
			    					delete existingContacts[""+id];
			    				} else {
			    					fetchIDs.push(""+id);
			    				}
			    				if (fetchIDs.length === 100) break;
			    			}

			    			if (fetchIDs.length === 0) return callback(null);

			    			var url = "https://api.twitter.com/1.1/users/lookup.json?user_id=" + fetchIDs.join(",") + "&include_entities=false";

			    			initOptions.logger.debug("[rolodex][twitter] fetch:", url);

							return REQUEST.get({
								url: url,
								oauth: {
									consumer_key: config.passport.consumerKey,
							        consumer_secret: config.passport.consumerSecret,
							        token: passportSession.accessToken,
							        token_secret: passportSession.accessTokenSecret
						        },
								json: true
							}, function (err, res, users) {
								if (err) return callback(err);
								return checkForErrors(users, function(err) {
									if (err) return callback(err);
									try {

						    			if (!users || !Array.isArray(users)) throw new Error("No `users` array returned");

										users.forEach(function(user) {
											/*
											{
												id: 533884891,
												id_str: '533884891',
												name: 'Meteor',
												screen_name: 'meteorjs',
												location: '',
												url: 'http://meteor.com/',
												description: 'Meteor is an open-source platform for building top-quality web apps in a fraction of the time, whether you\'re an expert developer or just getting started.',
												protected: false,
												followers_count: 17871,
												friends_count: 28,
												listed_count: 530,
												created_at: 'Fri Mar 23 04:54:21 +0000 2012',
												favourites_count: 11,
												utc_offset: null,
												time_zone: null,
												geo_enabled: false,
												verified: false,
												statuses_count: 651,
												lang: 'en',
												contributors_enabled: false,
												is_translator: false,
												profile_background_color: '131516',
												profile_background_image_url: 'http://a0.twimg.com/images/themes/theme14/bg.gif',
												profile_background_image_url_https: 'https://si0.twimg.com/images/themes/theme14/bg.gif',
												profile_background_tile: true,
												profile_image_url: 'http://a0.twimg.com/profile_images/2080420398/twitter-rock128_normal.png',
												profile_image_url_https: 'https://si0.twimg.com/profile_images/2080420398/twitter-rock128_normal.png',
												profile_link_color: '009999',
												profile_sidebar_border_color: 'EEEEEE',
												profile_sidebar_fill_color: 'EFEFEF',
												profile_text_color: '333333',
												profile_use_background_image: true,
												default_profile: false,
												default_profile_image: false,
												following: true,
												follow_request_sent: false,
												notifications: false
											}
											*/

											delete existingContacts[""+user.id];

											contacts[""+user.id] = {
												"uid": "twitter:" + user.id,
												"nickname": user.screen_name || null,
												"fn": user.name || null,
												"photo": user.profile_image_url || null
											};
										});

										service.set("contactsFetched", Object.keys(contacts).length);

									} catch(err) {
										initOptions.logger.error("[rolodex][twitter] users:", users);
										return callback(err);
									}

									if (ids.length > 0) {
										return fetchUsers(callback);
									}

									return callback(null);
								});
							});
						}, callback);
		    		}

		    		return fetchIDs(-1, function(err) {
		    			if (err) return callback(err);

			    		return fetchUsers(function(err) {
			    			if (err) return callback(err);

				    		for (var contactId in existingContacts) {
				    			initOptions.logger.debug("[rolodex][twitter] delete old:", contactId);
				    			delete contacts[contactId];
				    		}

							service.set("contactsFetched", Object.keys(contacts).length);

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
