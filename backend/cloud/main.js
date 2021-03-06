/**
 * Required Modules
 */
var Notifications = require("cloud/notifications.js");
var moment = require('cloud/moment-timezone-with-data.js');
var SummaryModule = require("cloud/summary.js");
var TestDataModule = require('cloud/testdata.js');
var Triggers = require('cloud/triggers.js');
var SMS = require('cloud/sms.js');
var JOBS = require('cloud/jobs.js');

/**
 * Triggers Section
 */
Parse.Cloud.beforeSave(Parse.User, Triggers.beforeSaveUser);

Parse.Cloud.beforeSave("CoachUserLink", Triggers.beforeSaveCoachUserLink);
Parse.Cloud.afterSave("CoachUserLink", Triggers.afterSaveCoachUserLink);

Parse.Cloud.afterSave("Meal", Triggers.afterSaveMeal);
Parse.Cloud.beforeSave("Meal", Triggers.beforeSaveMeal);

Parse.Cloud.beforeSave("ClientInfo", Triggers.beforeClientInfo);
Parse.Cloud.afterSave("ClientInfo", Triggers.afterClientInfo);

/**
 * Jobs Section
 */
// Weekly Summary Cron Job
Parse.Cloud.job("fg_reminders", JOBS.remindersJob);
Parse.Cloud.job("fg_summaries", JOBS.summaryJob);
Parse.Cloud.job("fg_test1", function(request, status) {

	console.log("fg_test1 " + moment().format());

	status.success("ok");

});
Parse.Cloud.job("fg_test2", function(request, status) {

	console.log("fg_test2 " + moment().format());

	status.error("test fail");
});

/**
 Cloud Functions
 */
//Confirm phone Number by sending SMS
Parse.Cloud.define("confirmPhoneNumber", SMS.confirmPhoneNumber);

// Validate Verification Code that was received in SMS
Parse.Cloud.define("validateVerificationCode", SMS.validateVerificationCode);

//Test Data : {"coachId":"tshO1U2vua","userId":"vXui2W8A7D","beginDate":"2015-05-31T00:00:00.000Z","endDate":"2015-06-07T00:00:00.000Z","profileBeginDate":"2015-05-31T00:00:00.000Z","beginWeekDay":"0"}
//Begin load meals cloud function

Parse.Cloud.define("getUserNotificationCounts", function(request, response) {

	var coachId = request.params.coachId;

	console.log("COACH ID equals " + coachId);

	var mealsQuery = new Parse.Query("Notifications");

	mealsQuery.equalTo("targetUser", {
		__type : 'Pointer',
		className : '_User',
		objectId : coachId
	});

	mealsQuery.doesNotExist("viewedAt");
	mealsQuery.containedIn("notificationType", [Notifications.NOTIFICATION_TYPE_NEW_MEAL, Notifications.NOTIFICATION_TYPE_USER_COMMENTED, Notifications.NOTIFICATION_TYPE_COACH_REVIEW_MEALS_REMINDER, Notifications.NOTIFICATION_TYPE_SUMMARY_AVAILABLE_TO_COACH, Notifications.NOTIFICATION_TYPE_SUMMARY_REMINDER_END_OF_WEEK]);

	mealsQuery.ascending("user");

	var resultSet = new Array();
	var keySet = new Array();

	mealsQuery.find().then(function(mealsForEveryone) {

		for (var i = 0; i < mealsForEveryone.length; i++) {

			var meal = mealsForEveryone[i];

			var mealUser = meal.get("user");

			if (resultSet[mealUser.id]) {
				resultSet[mealUser.id] = resultSet[mealUser.id] + 1;
			} else {
				keySet.push(mealUser.id);
				resultSet[mealUser.id] = 1;
			}

		}

		var returnedSet = new Array();

		for (var j = 0; j < keySet.length; j++) {

			returnedSet.push({
				user : keySet[j],
				count : resultSet[keySet[j]]
			});

		}

		response.success(returnedSet);

	}, function(error) {
		console.error("Failed to load meals to return meal count " + JSON.stringify(error));
		response.error("UnableToLoad");
	});

});

Parse.Cloud.define("markCommentRead", function(request, response) {

	var userId = request.params.targetUserId;
	var mealId = request.params.mealId;

	var notificationsQuery = new Parse.Query("Notifications");

	notificationsQuery.equalTo("targetUser", {
		__type : 'Pointer',
		className : '_User',
		objectId : userId
	});

	notificationsQuery.doesNotExist("viewedAt");
	notificationsQuery.containedIn("notificationType", [Notifications.NOTIFICATION_TYPE_USER_COMMENTED, Notifications.NOTIFICATION_TYPE_COACH_COMMENTED]);

	notificationsQuery.find().then(function(notifications) {

		var promises = new Array();

		for (var i = 0; i < notifications.length; i++) {

			var notification = notifications[i];
			notification.set("viewedAt", new Date());
			promises.push(notification.save());

		}

		return new Parse.Promise.when(promises);

	}).then(function(promises) {

		response.success("ok");

	}, function(error) {
		console.error("Failed to load Notifications to mark read" + JSON.stringify(error));
		response.error("UnableToSave");
	});

});

/**
 *
 */
Parse.Cloud.define("testRunner", function(request, response) {

	var userId = request.params.userId;

	var coachId = request.params.coachId;

	var action = request.params.action;

	switch(action) {
	case "createAll":
		TestDataModule.createAll().then(function(ok) {
			response.success("OK");
		}, function(error) {
			response.error(JSON.stringify(error));
		});
		break;
	case "moment":

		var now = new Date();

		console.log(moment().tz("Asia/Hebron").format());
		console.log(moment(now).tz("Asia/Hebron").format());
		console.log(moment(now).tz("America/Toronto").format());

		console.log("Start of" + moment(now).tz("America/Toronto").startOf('day').format());
		console.log("end of" + moment(now).tz("America/Toronto").endOf('day').format());

		var nowToronto = moment().tz("America/Toronto");
		var eodToronto = nowToronto.clone().endOf('day');

		console.log("Difference between " + nowToronto.format() + " and " + eodToronto.format() + " is in hours : " + eodToronto.diff(nowToronto, 'hours'));

		console.log("Difference between " + nowToronto.format() + " and " + eodToronto.format() + " is in minutes : " + eodToronto.diff(nowToronto, 'minutes'));

		console.log("Difference between " + nowToronto.format() + " and " + eodToronto.format() + " is in minutes : " + nowToronto.diff(eodToronto, 'minutes'));

		var startOfToday = moment().tz("America/Toronto").startOf('day');

		console.log("Start Of day today " + startOfToday.format("YYYY-MM-DD HH:mm:ss E") + " 7 day before " + startOfToday.subtract(7, 'days').format("YYYY-MM-DD HH:mm:ss E"));

		break;
	case 'summary':
		SummaryModule.processUsersSummary().then(function() {
			response.success("Summary Run Successfully");
		}, function(error) {
			response.error("Error Running Summary " + JSON.stringify(error));
		});
		break;
	case 'daysLogic':

		var today = moment();

		for (var i = 0; i < 30; i++) {

			var day = today.clone().subtract(i, 'day');
			var week = today.diff(day, 'days');
			console.log("Profile Begin Date: " + day.format() + " Profile Begin Day =" + day.day() + "diff in days " + week + " Week Number " + (Math.ceil(week / 7) + 1) + " Mod 7 " + (week % 7));
		}

		break;
	case 'notificationScheduling':
		var user = {
			__type : 'Pointer',
			className : '_User',
			objectId : "userId"
		};

		var coach = {
			__type : 'Pointer',
			className : '_User',
			objectId : "coachId"
		};

		var notifyReminderDateTime = moment().tz("America/Toronto").hour(12).minute(0);

		promises.push(Notifications.sendNotification(user, Notifications.NOTIFICATION_TYPE_SUMMARY_AVAIALABLE_TO_USER, user, coach, null, null, notifyReminderDateTime.toDate()));

		break;
	case "createMeals":

		var user = {
			__type : 'Pointer',
			className : '_User',
			objectId : userId
		};

		var coach = {
			__type : 'Pointer',
			className : '_User',
			objectId : coachId
		};

		var weekStart = new Date(request.params.weekStartDate);

		TestDataModule.createDataForMeal(weekStart, user, coach).then(function(ok) {
			response.success("OK");
		}, function(error) {
			response.error(JSON.stringify(error));
		});
		break;
	}

});

//TODO: Data cleanup tasks to be done ..
//Truncate or archive meals , meal images, that are older than x days ...
// Truncate users or archive usrs, older than x days

