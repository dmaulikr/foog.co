var Notifications = require("cloud/notifications.js");
var utils = require("cloud/utils.js");
var summary = require("cloud/summary.js");
var moment = require('cloud/moment-timezone-with-data.js');

var TIMEZONE = "America/Toronto";

//TODO: Add trigger afterSave ClientInfo. Copy day of week . to User table

var beforeSaveMeal = function(request, response) {

	request.object.set("changedFields", request.object.dirtyKeys());

	if (!request.object.id) {
		// new meal. set date reminded.
		request.object.set("coachRemindedAt", new Date());

		response.success();
	} else {

		var coachRev = utils.fieldChanged(request.object.dirtyKeys(), "coachReviewedAt");
		var userRev = utils.fieldChanged(request.object.dirtyKeys(), "userReviewedAt");


		if (coachRev || userRev) {

			markNotificationsForMealAsViewed(request.object, coachRev).then(function() {
				response.success();
			}, function(error) {
				response.success();
			});

		} else {
			response.success();
		}

	}

};

var afterSaveMeal = function(request) {

	var meal = request.object;

	var changedFields = meal.get("changedFields");

	var user = meal.get("user");
	var coach = meal.get("coach");

	if (user && coach) {

		//TODO: Update Client info with last meal submitted date, so that no need to remind?

		// Based on changed fields .. Decide what to notify about;

		var notificationType = null;
		var scheduledTime = null;

		if (utils.fieldChanged(changedFields, "coachCommentedAt")) {

			Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_COACH_COMMENTED, user, coach, meal, null);

		} else if (utils.fieldChanged(changedFields, "userCommentedAt")) {

			Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_USER_COMMENTED, user, coach, meal, null);

		} else if (utils.fieldChanged(changedFields, "coachReviewedAt")) {

			Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_COACH_REVIEWED_MEAL, user, coach, meal, null);

		} else if (utils.fieldChanged(changedFields, "appCreatedAt")) {

			Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_NEW_MEAL, user, coach, meal, null);
			// The location of this IF is important, since we want appCreatedAt to trigger befor ethis.
			// Only if meal is existing and coach reminded At is updated, then we remind coach.
		} else if (utils.fieldChanged(changedFields, "coachRemindedAt") && (meal.existed() === true)) {

			// Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_COACH_REVIEW_MEALS_REMINDER, user, coach, meal, null, scheduledTime);
		}

	}

};

var markNotificationsForMealAsViewed = function(meal, isCoach) {

	var query = new Parse.Query("Notifications");
	query.equalTo("targetMeal", meal);
	query.doesNotExist("viewedAt");
	// Clear only the notifications belonging to the coach as target.
	if (isCoach) {
		query.equalTo("targetUser", meal.get("coach"));
	} else {
		query.equalTo("targetUser", meal.get("user"));
	}

	return query.find().then(function(notifications) {

		var promises = new Array();

		for (var i = 0; i < notifications.length; i++) {

			var notification = notifications[i];
			notification.set("viewedAt", new Date());
			promises.push(notification.save());

		}

		return promises;

	});

};

var beforeSaveUser = function(request, response) {

	//TODO: Revise this code...
	// Hold CoachID

	var coachId = request.object.get("coachId");

	var objectId = request.object.id;

	// Make sure this call is to register new Coach.
	if (coachId && !objectId) {
		// Make sure that CoachID is not already taken.
		var query = new Parse.Query("User");
		query.equalTo("coachId", coachId);
		query.first({
			success : function(object) {
				if (object) {
					response.error("CoachIdIsTaken");
				} else {
					response.success();
				}
			},
			error : function(error) {
				response.error("Could not validate uniqueness CoachID");
			}
		});
	} else {
		response.success();
	}
};

var beforeSaveCoachUserLink = function(request, response) {

	request.object.set("changedFields", request.object.dirtyKeys());

	// Hold CoachID
	var coachId = request.object.get("coachId");

	// If no coach ID is set, this is a request from CloudCode not app.
	if (!coachId) {
		response.success();
		return;
	}

	// Find Coach User object with provided CoachID.
	var query = new Parse.Query(Parse.User);
	query.equalTo("coachId", coachId);
	query.first({
		success : function(coach) {
			if (coach) {
				// Replace CoachID within CoachUserLink with Coach User object.
				request.object.unset("coachId");
				request.object.set("coach", coach);
				request.object.set("remindedAt", new Date());
				response.success();

			} else {
				response.error("CoachNotFound");
			}
		},
		error : function(error) {
			response.error("QueryError");
		}
	});

};

var afterSaveCoachUserLink = function(request) {

	//Validate if this is a new user link and not an update...

	var coachUserLink = request.object;

	var changedFields = coachUserLink.get("changedFields");

	var terminatedBy = coachUserLink.get("terminatedBy");
	var coach = coachUserLink.get("coach");
	var user = coachUserLink.get("user");

	// User and Coach need both be set
	if (user && coach) {

		if (utils.fieldChanged(changedFields, "linkedAt")) {
			// New LINK

			// Get the user...
			var userQuery = new Parse.Query(Parse.User);

			userQuery.get(user.id).then(function(theUser) {

				Parse.Cloud.useMasterKey();
				theUser.set("coach", coach);

				return theUser.save();
			}).then(function(savedUser) {

				Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_COACH_ACCEPTED_LINK_REQUEST, user, coach);

			}, function(error) {
				console.error("afterSaveCoachUserLink linkedAt" + JSON.stringify(error));
			});

		} else if (utils.fieldChanged(changedFields, "rejectedAt")) {

			// Coach rejected linking request ... Oh no !
			// User needs to be notified
			Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_COACH_REJECTED_LINK_REQUEST, user, coach);

		} else if (utils.fieldChanged(changedFields, "cancelledAt")) {
			// User got bored of waiting and decided to cancel.
			// Coach needs to be notified
			Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_USER_CANCELLED_LINK_REQUEST, user, coach);

		} else if (utils.fieldChanged(changedFields, "terminatedAt")) {

			// Get the user...
			var userQuery = new Parse.Query(Parse.User);

			userQuery.get(user.id).then(function(theUser) {

				Parse.Cloud.useMasterKey();

				theUser.unset("coach");

				return theUser.save();
			}).then(function() {

				if (terminatedBy.objectId == user.objectId) {
					Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_USER_UNLINKED, user, coach);
				} else {
					Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_COACH_UNLINKED, user, coach);
				}

			}, function(error) {
				console.error("afterSaveCoachUserLink terminatedAt" + JSON.stringify(error));
			});

		} else if (utils.fieldChanged(changedFields, "remindedAt") && (coachUserLink.exitsed() === true)) {
			// Send a reminder. if remindedAt has been manipulated, while objected exited (not on creation)
			//TODO: This has to be scheduled.
			Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_COACH_PENDING_LINK_REQUESTS, user, coach);

		} else {
			// If we get here it means we are on creation...

			console.log("Fields Changed in this case " + JSON.stringify(changedFields));
			// if not linked nor rejected, this is a new request.
			// Coach needs to be notified
			Notifications.sendNotification(coach, Notifications.NOTIFICATION_TYPE_USER_SENT_LINK_REQUEST, user, coach);

			return;

		}

	}

};

var beforeClientInfo = function(request, response) {

	request.object.set("changedFields", request.object.dirtyKeys());

	response.success();

};
var afterClientInfo = function(request) {

	var clientInfo = request.object;

	var changedFields = clientInfo.get("changedFields");
	var timezone = clientInfo.get("timezone");
	var user = clientInfo.get("user");
	var coach = clientInfo.get("coach");

	// Only if this is new and not an update.

	if (clientInfo.existed() === false) {
		// Create summary card of 0
		summary.createWeekSummaryCard(1, user, coach, timezone).then(function(summaryCard) {

		}, function(error) {
			console.error("afterClientInfoERR " + JSON.stringify(error));
		});
	}

	// If the key for processing changes, we dont care.

	if (utils.fieldChanged(changedFields, "mealReminderDate") && (clientInfo.existed() === true)) {

		Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_USER_SUBMITTED_NO_MEALS_REMINDER, user, coach, null, null);

	}

};

exports.afterSaveMeal = afterSaveMeal;
exports.beforeSaveUser = beforeSaveUser;
exports.beforeSaveCoachUserLink = beforeSaveCoachUserLink;
exports.afterSaveCoachUserLink = afterSaveCoachUserLink;
exports.beforeSaveMeal = beforeSaveMeal;
exports.afterClientInfo = afterClientInfo;
exports.beforeClientInfo = beforeClientInfo;
