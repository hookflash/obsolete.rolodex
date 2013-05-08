
module.exports = function(options) {
	options = options || {};
	options.repeat = options.repeat || {};
	options.repeat.max = options.repeat.max || 3;
	options.repeat.delay = options.repeat.delay || 500;
	options.delay = options.delay || 250;
	var lastRun = 0;
	return function(worker, callback) {
		var errorCount = 0;
		function runTask(worker, callback) {
			lastRun = Date.now();
			function error(err) {
				if (err.code === "ACCESS_TOKEN_EXPIRED") {
					// Don't re-try.
					return callback(err);
				}
				errorCount += 1;
				console.error("[rolodex][requester] Error(" + errorCount + "/" + options.repeat.max + "):", err.stack);
				if (errorCount === options.repeat.max) {
					return callback(err);
				}
				return setTimeout(function() {
					return runTask(worker, callback);
				}, options.repeat.delay);
			}
			try {
				return worker(function(err) {
					if (err) return error(err);
					return callback.apply(null, arguments);
				});
			} catch(err) {
				return error(err);
			}
		}
		var delay = Date.now() - lastRun - options.delay;
		if (delay < 0) {
			delay *= -1;
		} else {
			delay = 0;
		}
		setTimeout(function() {
			return runTask(worker, function() {
				return callback.apply(null, arguments);
			});
		}, delay);
	};
};
