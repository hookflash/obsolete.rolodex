
const ASSERT = require("assert");
const SERVER = require("../server");
const REQUEST = require("request");

var TOKEN = "<TOKEN>";

describe("api", function() {

    var serverInfo = null;

    it("start server", function(done) {
        return SERVER.main(function(err, info) {
            if (err) return done(err);
            serverInfo = info;
            return done(null);
        });
    });

    it("/rolodex-access", function(done) {

        return REQUEST.post({
            method: "POST",
            url: "http://localhost:" + serverInfo.port + "/rolodex-access",
            body: JSON.stringify({
              "request": {
                "$domain": "provider.com",
                "$appid": "xyz123",
                "$id": "abd23",
                "$handler": "rolodex",
                "$method": "rolodex-access",
                // TODO: Implement security.
                //"clientNonce": "ed585021eec72de8634ed1a5e24c66c2",
                "identity": {
                  // TODO: Implement security.
                  //"accessToken": "a913c2c3314ce71aee554986204a349b",
                  //"accessSecretProof": "b7277a5e49b3f5ffa9a8cb1feb86125f75511988",
                  //"accessSecretProofExpires": 43843298934,
                  // TODO: Implement grant.
                  //"uri": "identity://domain.com/alice",
                  //"provider": "domain.com"
                },
                "rolodex": {
                   "serverToken": TOKEN
                }
                //"agent": {
                //  "userAgent": "hookflash/1.0.1001a (iOS/iPad)",
                //  "name": "hookflash",
                //  "image": "https://hookflash.com/brandsquare.png",
                //  "url": "https://hookflash.com/agentinfo/"
                //},
                // TODO: Implement grant.
                //"grant": {
                //  "$id": "de0c8c10d692bc91c1a551f57a50d2f97ef67543"
                //}
              }
            }),
            headers: {
                "Content-Type": "application/json"
            }
        }, function (err, response, body) {
            if (err) return done(err);

            return done(null);
        });
    });

    it("/rolodex-contacts-get", function(done) {

        this.timeout(60 * 30 * 1000);

        function fetchContacts(refresh, callback) {

            return REQUEST.post({
                method: "POST",
                url: "http://localhost:" + serverInfo.port + "/rolodex-contacts-get",
                body: JSON.stringify({
                  "request": {
                    "$domain": "provider.com",
                    "$appid": "xyz123",
                    "$id": "abd23",
                    "$handler": "rolodex",
                    "$method": "rolodex-access",
                    // TODO: Implement security.
                    //"clientNonce": "ed585021eec72de8634ed1a5e24c66c2",
                    "rolodex": {
                       "serverToken": TOKEN,
                       // TODO: Implement security.
                       //"accessToken": "a913c2c3314ce71aee554986204a349b",
                       //"accessSecretProof": "b7277a5e49b3f5ffa9a8cb1feb86125f75511988",
                       //"accessSecretProofExpires": 43843298934,
                       // TODO: Implement deltas.
                       //"version": "4341443-54343a",
                       "refresh": refresh
                     }
                  }
                }),
                headers: {
                    "Content-Type": "application/json"
                }
            }, function (err, response, body) {
                if (err) return done(err);

                var result = JSON.parse(body).result;

                if (result.identities.identity.length === 0) {
                    return setTimeout(function() {
                        return fetchContacts(false, callback);
                    }, (result.rolodex.updateNext - Math.round(Date.now()/1000)) * 1000);
                }

                ASSERT.equal(result.identities.identity.length > 0, true);

                return done(null);
            });
        }

        fetchContacts(true, done);
    });

    it("stop server", function(done) {
        return serverInfo.server.close(function() {
            return done(null);
        });
    });
});
