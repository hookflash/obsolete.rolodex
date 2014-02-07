OpenPeer adapter for Rolodex
============================

Testing
-------

Get a valid rolodex token from http://http://opjsdemo-v1-<BRANCH>-i.hcs.io/ by looking for a `token` property in the `/.openpeer-rolodex/services` request.
Insert this token at `<TOKEN>`at `./tests/api.js`.

    make test
