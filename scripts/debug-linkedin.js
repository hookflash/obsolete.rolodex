
var contacts = [
];

var summary = {
	privateCount: 0,
	uniqueCount: 0,
	duplicateCount: 0,
	idsCount: 0,
	ids: {}
};

contacts.forEach(function(contact) {

	if (contact.id === "private") {
		summary.privateCount += 1;
	} else
	if (summary.ids[contact.id]) {
		summary.ids[contact.id] += 1;
		summary.duplicateCount += 1;
	} else {
		summary.ids[contact.id] = 1;
		summary.uniqueCount += 1;
	}

});

summary.idsCount = Object.keys(summary.ids).length;

console.log("summary", summary);
