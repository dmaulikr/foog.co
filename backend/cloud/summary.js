var Notifications = require("cloud/notifications.js");
var _ = require('underscore.js');
var utils = require("cloud/utils.js");
var moment = require('cloud/moment-timezone-with-data.js');

var DATE_FORMAT_FOR_MOMENT_FOR_GROUPING = "YYYY-MM-DD";

//TODO : What happens if coach changes day of week .. before a summary runs ...
//TODO: What happens if coach unlinks then links again ..

var supportedTimezones = ['Asia/Hebron', 'America/Toronto'];

var weekday = new Array(7);
weekday[0] = "Sunday";
weekday[1] = "Monday";
weekday[2] = "Tuesday";
weekday[3] = "Wednesday";
weekday[4] = "Thursday";
weekday[5] = "Friday";
weekday[6] = "Saturday";

var daysToMillis = function(days) {

	return days * 24 * 60 * 60 * 1000;
};

var weekDayToString = function(weekDayInt) {
	return weekday[weekDayInt];
};

var initializeSummaryStructures = function(beginDateTz) {

	var dates = new Array();
	var groupedByDay = new Array();

	// take start date and add one day

	// fill the array by walking through the dates ...
	// dates array will also hold dates in that order
	// then setup what you need.
	//groupedByDay[day]={
	//dayOfWeek: day name (monday,tuesday,etc..) or day index.
	//meals: []  objects.
	//numberOfMeals : or we can do meals.length

	for (var daysToAdd = 0; daysToAdd < 7; daysToAdd++) {

		var theDate = beginDateTz.clone().add(daysToAdd, 'days');

		var df = theDate.format(DATE_FORMAT_FOR_MOMENT_FOR_GROUPING);

		dates.push({
			label : df,
			day : theDate.day()
		});
		groupedByDay[df] = new Array();
	}

	return {
		dates : dates,
		groupedByDay : groupedByDay
	};

};

var groupMeals = function(mealsPerQueryWeek, beginDateTz, timezone) {

	var holdingDS = initializeSummaryStructures(beginDateTz);

	var dates = holdingDS.dates;
	var groupedByDay = holdingDS.groupedByDay;

	for (var i = 0; i < mealsPerQueryWeek.length; i++) {// All Query items ... which include multiple items per day

		var meal = mealsPerQueryWeek[i];

		console.log("Meal is " + JSON.stringify(meal));

		var createdAt = meal.get("appCreatedAt");

		var createdAtTz = moment(createdAt).tz(timezone);

		var dateFormatted = createdAtTz.format(DATE_FORMAT_FOR_MOMENT_FOR_GROUPING);

		var dayOfWeek = createdAtTz.day();

		if (!groupedByDay[dateFormatted]) {
			//Should be ERROR HERE
			console.error("Group By Day Not Found " + dateFormatted);
		}

		var itemMarkers = meal.get("itemMarkers");

		console.log("Pushing meal " + dateFormatted + " meal created At : " + createdAtTz.format());

		groupedByDay[dateFormatted].push({
			createdAt : createdAt,
			itemMarkers : itemMarkers
		});

	}// end of loop on all items in the query mealsPerQueryWeek

	return {
		dates : dates,
		groupedByDay : groupedByDay
	};

};

var calculateAvgEfficiency = function(efficiencyDataWeekly) {

	var sumOf = 0;

	for (var j = 0; j < efficiencyDataWeekly.length; j++) {

		sumOf += efficiencyDataWeekly[j];

	}

	var avgEfficiency = sumOf / efficiencyDataWeekly.length;

	return avgEfficiency;

};

var calculateWeekSummary = function(mealsPerQueryWeek, beginDate, timezone) {

	var efficiencyDataWeekly = new Array();

	// These are total checks and crosses per fucking week...
	var noChecksPerWeek = 0;
	var noCrossesPerWeek = 0;
	var noMealsPerWeek = 0;

	var maximumMealsPerDay = 0;
	var maximumMealsPerDayIndex = 0;

	var holdingDS = groupMeals(mealsPerQueryWeek, beginDate, timezone);

	var dates = holdingDS.dates;
	var groupedByDay = holdingDS.groupedByDay;

	// For every day :
	for (var i = 0; i < dates.length; i++) {

		mealsPerDay = groupedByDay[dates[i].label];

		if (!mealsPerDay) {
			mealsPerDay = [];
		}

		console.log("Meals Per Day : " + JSON.stringify(mealsPerDay));

		var noMealsPerDay = mealsPerDay.length;

		noMealsPerWeek += noMealsPerDay;

		var checksPerDay = 0;
		var crossesPerDay = 0;
		var efficiencyPerDay = 0;

		if (noMealsPerDay > maximumMealsPerDay) {
			maximumMealsPerDay = noMealsPerDay;
			maximumMealsPerDayIndex = i;
		}

		// For every meal in that day ...
		for (var j = 0; j < mealsPerDay.length; j++) {

			// For every day , add all meals per day...
			var dayMeal = mealsPerDay[j];

			var itemMarkers = dayMeal.itemMarkers;

			if (!itemMarkers) {
				itemMarkers = [];
			}

			for (var markerIndex = 0; markerIndex < itemMarkers.length; markerIndex++) {

				var marker = itemMarkers[markerIndex];

				var checkOrCross = marker[0];

				if (checkOrCross == "Check") {
					noChecksPerWeek++;
					checksPerDay++;
				} else if (checkOrCross == "Cross") {
					noCrossesPerWeek++;
					crossesPerDay++;
				} else {
					console.error("Fuck " + checkOrCross);
				}

			} // end of for loop ... read all items markers

		}// end of for loop ,... mealsPerDay.length

		var noMealsFactor = 0;

		if (noMealsPerDay > 3) {
			noMealsFactor = 50;
		} else if (noMealsPerDay > 0) {
			noMealsFactor = 30;
		} else {
			noMealsFactor = 0;
		}

		var checksFactor = Math.round(checksPerDay / (checksPerDay + crossesPerDay) * 50);

		if (!checksFactor) {
			checksFactor = 0;
		}

		var efficiencyPerDay = noMealsFactor + checksFactor;

		efficiencyDataWeekly[i] = efficiencyPerDay;

		// Calculate efficiency then

		console.log("Meals Per Day Summary : " + JSON.stringify(groupedByDay[dates[i].label]));

	}// end of dates.length loop

	//NOW :

	var peakDay = weekday[dates[maximumMealsPerDayIndex].day];

	var avgEfficiency = calculateAvgEfficiency(efficiencyDataWeekly);

	return {
		efficiencyDataWeekly : efficiencyDataWeekly,
		avgEfficiency : avgEfficiency,
		peakDay : peakDay,
		noChecksPerWeek : noChecksPerWeek,
		noCrossesPerWeek : noCrossesPerWeek,
		noMealsPerWeek : noMealsPerWeek
	};

};

var populateThisWeekSummaryCard = function(results, mealsForWeek, userPointer, coachPointer, beginDateTz, timezone) {

	thisWeekSummaryCard = results[0];

	var currentWeek = thisWeekSummaryCard.get('weekNumber');

	// Set all other parameters.

	var summaryData = calculateWeekSummary(mealsForWeek, beginDateTz, timezone);

	thisWeekSummaryCard.set("efficiency", summaryData.avgEfficiency);
	thisWeekSummaryCard.set("checks", summaryData.noChecksPerWeek);
	thisWeekSummaryCard.set("crosses", summaryData.noCrossesPerWeek);
	thisWeekSummaryCard.set("meals", summaryData.noMealsPerWeek);
	thisWeekSummaryCard.set("peakDay", summaryData.peakDay);
	// thisWeekSummaryCard.set("weekNumber", ); Week Label already set
	thisWeekSummaryCard.set("efficiencyDataWeek", summaryData.efficiencyDataWeekly);
	thisWeekSummaryCard.set("summaryCreatedAt", new Date());
	thisWeekSummaryCard.set("user", userPointer);
	thisWeekSummaryCard.set("coach", coachPointer);
	// Timezone already set from last week.

	// Monthly Efficiency Data :
	var efficiencyDataMonth = [];

	// Summaries are ordered descending , and limited to 4.

	for (var jj = results.length - 1; jj >= 0; jj--) {

		var weekSum = results[jj];

		var weekNum = weekSum.get('weekNumber');
		var weekSumSum = weekSum.get('efficiencyDataWeek');

		var weekName = "Week " + weekNum;

		efficiencyDataMonth.push({
			Data : weekSumSum,
			weekName : weekName
		});
	}

	thisWeekSummaryCard.set("efficiencyDataMonth", efficiencyDataMonth);

	return thisWeekSummaryCard;

};

var populateNextWeekSummaryCard = function(weekNumber, userPointer, coachPointer, timezone) {

	var SummaryCard = Parse.Object.extend("SummaryCard");
	var nextWeekSummaryCard = new SummaryCard();
	nextWeekSummaryCard.set("weekNumber", weekNumber);
	// Summary created At should be left null.
	nextWeekSummaryCard.set("user", userPointer);
	nextWeekSummaryCard.set("coach", coachPointer);
	nextWeekSummaryCard.set("timezone", timezone);

	return nextWeekSummaryCard;

};

var saveUserMealSummary = function(coachPointer, userPointer, todayInTimezone, profileBeginDateTz, timezone) {

	// First get begin and end of day in timezone.
	// This gives me ... 00:00 of the day .. which is today.
	var endDateTz = todayInTimezone.clone().startOf('day');
	var weekStartDay = todayInTimezone.day();

	// last week midnight . Subtract 7 days from today ...
	var beginDateTz = endDateTz.clone().subtract(7, 'days');

	// Look at Profile Begin date, which day it was ...
	// If its equals, then it's best scenario
	// If Begin date day is after , good scenario
	// If before , we need to advance a week.
	var profileBeginDayTz = profileBeginDateTz.day();

	// if I setup profile Monday, begin week sunday ... all is good. week 1 ends on saturday
	// If profile setup Sunday, begin week Monday ... week 1 is super short..

	//How many days between Today (which is the start of a new week ), and the profile begin date..
	// Take the number of days , then look at the remainder??
	var diffInDays = endDateTz.diff(profileBeginDateTz, 'days');

	var userWeekNumber = Math.ceil(diffInDays / 7);
	
	if (userWeekNumber == 0) {
		userWeekNumber = 1;
	}

	var userId = JSON.stringify(userPointer);
	var coachId = JSON.stringify(coachPointer);

	console.log("Processing summary for [" + userId + "] with coach [" + coachId + "] Dates between: [" + beginDateTz.format() + "] and [" + endDateTz.format() + "] Begin Week Day [" + profileBeginDayTz + "] Profile Begin Date [" + profileBeginDateTz.format() + "]");

	//Query meals, meals need to be UNLOCKED, if Locked, them Summary has already run ... we should not produce a new summary
	var query = new Parse.Query("Meal");
	query.greaterThanOrEqualTo("appCreatedAt", beginDateTz.toDate());
	query.lessThan("appCreatedAt", endDateTz.toDate());
	query.equalTo("user", userPointer);
	query.doesNotExist("summaryCreatedAt");
	query.equalTo("coach", coachPointer);
	query.ascending("appCreatedAt");

	// We have to query for the latest summary card
	var SummaryCard = Parse.Object.extend("SummaryCard");
	var summaryQuery = new Parse.Query(SummaryCard);
	summaryQuery.equalTo("user", userPointer);
	summaryQuery.equalTo("coach", coachPointer);
	// We can limit this query to 4 results... since 4 is all we need to construct a month's summary
	summaryQuery.limit(4);
	summaryQuery.descending("weekNumber");
	// we don't filter by locked unlocked to get everything.. We need everything

	// Run meal query and summary Query ...
	return new Parse.Promise.when(query.find(), summaryQuery.find(), beginDateTz, endDateTz, userWeekNumber, timezone, userPointer, coachPointer).then(createSummaryCards).then(function(thisWeekSummaryCard, nextWeekSummaryCard, userPointer, coachPointer, mealsForWeek, timezone) {

		var mealMarkPromise = markMealsSummaryCreated(mealsForWeek);

		var remindersPromise = sendReminders(userPointer, coachPointer, timezone, thisWeekSummaryCard, nextWeekSummaryCard);

		return new Parse.Promise.when(mealMarkPromise, remindersPromise);

	});

};

var createSummaryCards = function(mealsForWeek, results, beginDateTz, endDateTz, userWeekNumber, timezone, userPointer, coachPointer) {

	var userId = JSON.stringify(userPointer);
	var coachId = JSON.stringify(coachPointer);

	console.log("Finding all Summary Cards " + results.length);

	if (results.length == 0) {
		// We should not be here... Since this means no Initial summary card has been created when a user has been created.. FAIL this user.
		console.error("Saving next summary for " + userId + " with coach " + coachId + " Dates between: [" + beginDateTz.format() + "] and [" + endDateTz.format() + "] FAILED !!!.. Unable to find summary card ");

		return Parse.Promise.error("Data Error : No initial summary card created for " + userId + " with coach " + coachId + " Dates between: [" + beginDateTz.format() + "] and [" + endDateTz.format() + "] FAILED !!!");
	}

	var thisWeekCard = results[0];

	var cardWeekNum = thisWeekCard.get('weekNumber');

	//TODO: We are likely to end up here is a user was processed before .... .... .... Should be Skipped..

	if (cardWeekNum != userWeekNumber) {

		return Parse.Promise.error("Data Error : Card Week Number does not match user Week Number " + userId + " with coach " + coachId + " Dates between: [" + beginDateTz.format() + "] and [" + endDateTz.format() + "] CardWeekNumber[" + cardWeekNum + "] UserWeekNumber [" + userWeekNumber + "]");
	}

	var isProcessedBefore = thisWeekCard.get('summaryCreatedAt');

	if (isProcessedBefore) {

		return Parse.Promise.error("Data Error : Summary has been processed before " + userId + " with coach " + coachId + " Dates between: [" + beginDateTz.format() + "] and [" + endDateTz.format() + "] FAILED !!!");
	}

	var twsCard = populateThisWeekSummaryCard(results, mealsForWeek, userPointer, coachPointer, beginDateTz, timezone);

	var nextWeekSummaryCard = populateNextWeekSummaryCard(cardWeekNum + 1, userPointer, coachPointer, timezone);

	return new Parse.Promise.when(twsCard.save(), nextWeekSummaryCard.save(), userPointer, coachPointer, mealsForWeek, timezone);

};

var markMealsSummaryCreated = function(mealsForWeek) {

	// Send reminders to Coach -
	// In Coach Timezone
	// We have user and coach
	// Remind about end of week .
	// End of week is coming soon .

	var promises = [];

	_.each(mealsForWeek, function(meal) {

		meal.set("summaryCreatedAt", new Date());

		promises.push(meal.save());

	});

	return Parse.Promise.when(promises);

};

var sendReminders = function(userPointer, coachPointer, timezone, thisWeekSummaryCard, nextWeekSummaryCard) {

	var promises = new Array();

	// Summary is 7 days .. remind on day 5
	// Send notification at 12 pm
	var reminderDateTime = moment().tz(timezone).add(5, 'days').hour(12).minute(0);
	console.log("Reminder Date is " + reminderDateTime.format());
	promises.push(Notifications.sendNotification(coachPointer, Notifications.NOTIFICATION_TYPE_SUMMARY_REMINDER_END_OF_WEEK, userPointer, coachPointer, null, nextWeekSummaryCard, reminderDateTime.toDate()));

	// Now in the timezone .. I want to send the notification at noon.
	var notifyReminderDateTime = moment().tz(timezone).hour(12).minute(0);
	console.log("Reminder Date NOTIFY IS " + notifyReminderDateTime.format());
	promises.push(Notifications.sendNotification(userPointer, Notifications.NOTIFICATION_TYPE_SUMMARY_AVAIALABLE_TO_USER, userPointer, coachPointer, null, thisWeekSummaryCard, notifyReminderDateTime.toDate()));

	promises.push(Notifications.sendNotification(coachPointer, Notifications.NOTIFICATION_TYPE_SUMMARY_AVAILABLE_TO_COACH, userPointer, coachPointer, null, thisWeekSummaryCard, notifyReminderDateTime.toDate()));

	return new Parse.Promise.when(promises);

};

var processUsersByWeekStartAndTimezone = function(today, timezone) {

	var todayInTimezone = today.clone().tz(timezone);

	// convert to a start date string
	var weekStartDay = todayInTimezone.format("dddd");

	console.log("Processing items - beginning of week is :  " + weekStartDay);

	var ClientInfo = Parse.Object.extend("ClientInfo");

	var query = new Parse.Query(ClientInfo);

	query.equalTo("weekStartDay", weekStartDay);
	query.equalTo("timezone", timezone);

	// What if these guys already have their cards processed.

	//TODO: once you have 100 users consider pagination maybe ???

	return query.find().then(function(results) {

		console.log("Results length " + results.length);

		var promises = [];

		_.each(results, function(result) {

			var cInfo = result;

			var profileBeginDateTz = moment(cInfo.createdAt).tz(timezone);
			var coachRef = cInfo.get('coach');
			var userRef = cInfo.get('user');

			//TODO: Do not go to coach user link. Go to User Table Directly, referring user and coach. if we get a result. great process
			// otherwise it is old. should Skip.
			// This way we have user entity. Can get timezone.

			var CoachUserLink = Parse.Object.extend("CoachUserLink");
			var coachUserQuery = new Parse.Query(CoachUserLink);

			coachUserQuery.equalTo("user", userRef);
			coachUserQuery.equalTo("coach", coachRef);
			coachUserQuery.doesNotExist("terminatedAt");
			coachUserQuery.doesNotExist("rejectedAt");
			coachUserQuery.doesNotExist("cancelledAt");
			coachUserQuery.exists("linkedAt");

			var promise = new Parse.Promise.when(coachUserQuery.find(), coachRef, userRef, todayInTimezone, timezone, profileBeginDateTz).then(processCoachUserLink);

			promises.push(promise);

		});
		//end of for each

		// Return a new promise that is resolved when all of the others are finished.
		return Parse.Promise.when(promises);
	});

};

var processCoachUserLink = function(coachUserLinks, coachRef, userRef, todayInTimezone, timezone, profileBeginDateTz) {

	console.log("References coach: " + JSON.stringify(coachRef) + " user Ref :" + JSON.stringify(userRef) + " Length " + coachUserLinks.length);

	if (coachUserLinks.length == 1) {
		//Make sure that user and coach are still linked ...

		return saveUserMealSummary(coachRef, userRef, todayInTimezone, profileBeginDateTz, timezone);

	} else if (coachUserLinks.length == 0) {
		console.log("User linked to Coach no longer active- Skipping : Coach:" + JSON.stringify(coachRef) + "User:" + JSON.stringify(userRef));
		return Parse.Promise.as("No Active user link - Skipping Coach:" + JSON.stringify(coachRef) + "User:" + JSON.stringify(userRef));
	} else {
		//ERROR here...
		console.error("User linked to Coach DATA ISSUE : Coach:" + JSON.stringify(coachRef) + "User:" + JSON.stringify(userRef));
		// Return a failed promise
		return Parse.Promise.error("Data Error : Multiple active user coach links found for " + JSON.stringify(userRef) + " with coach " + JSON.stringify(coachRef) + " Failed");
	}

};

var processUsersSummary = function() {

	//TODO later : we can make a list of supported timezones..
	// For all Supported Timezones.
	// If now is midnight for this timezone.
	// Find the day of week , Query Client info for Customers who today is end of week for, Based on the current date + Timezone.
	// Make sure they are linked to the appropraite coach.

	// If Time now corresponds to a midnight in a supported timezone....

	//TODO: For now we know everyone is in Toronto... and the team. Later we need to query all users. get all timezones..

	var promises = new Array();

	var now = moment();

	console.log("Process users Summary Batch Starting " + now.format());

	for (var tzIndex = 0; tzIndex < supportedTimezones.length; tzIndex++) {

		var tz = supportedTimezones[tzIndex];

		console.log("It is Midnight at Timezone " + tz);
		// For this Timezone, and for this day of week, find users who we need to query on.

		var promise = processUsersByWeekStartAndTimezone(now.clone(), tz);

		promises.push(promise);

	}

	return Parse.Promise.when(promises);

};

var createWeekSummaryCard = function(weekNumber, userPointer, coachPointer, timezone) {

	var card = populateNextWeekSummaryCard(weekNumber, userPointer, coachPointer, timezone);

	return card.save();
};

exports.weekDayToString = weekDayToString;
exports.processUsersSummary = processUsersSummary;
exports.createWeekSummaryCard = createWeekSummaryCard;
