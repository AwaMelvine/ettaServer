var mongoose = require("mongoose");

var EntrySchema = new mongoose.Schema({
	userId: { type: String, required: true },
	email: { type: String, required: true },
	// name: { type: String, required: true },
	timeIn: { type: Date, required: true },
	timeOut: { type: Date },
	location: { type: String, required: true },
	isCheckedIn: { type: Boolean, required: true },
	date: { type: Date, required: true }
});

module.exports = mongoose.model("Entry", EntrySchema);
