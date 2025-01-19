let teacherTranslations = {};

const maxCacheTime = 1800000; // 30 minutes

let accessToken = null;
let schoolName = null;
let schoolYear = null;

let appointmentsToday = null;
let currentAppointment = null;

let dayStartTime = null;
let latestAppointment = null;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['accessToken', 'schoolName', 'userInfo', 'schoolYear', 'extraInfoVisible'], function(result) {
        if(result.accessToken == undefined || result.schoolName == undefined || result.userInfo == undefined) {
            redirectLogin();
            return;
        }

        if(result.schoolYear == undefined) {
            redirectSchoolSelect();
            return;
        }

        accessToken = result.accessToken;
        schoolName = result.schoolName;
        schoolYear = result.schoolYear;
        document.getElementById('username-span').innerHTML = result.userInfo.firstName;

        extraInfoVisible = result.extraInfoVisible;
        applyExtraInfo();

        loadSchedule();
        setInterval(updateAppointmentView, 1000);
    });

    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("refresh-btn").addEventListener("click", e => {
		clearAppointmentView();
		retrieveSchedule();
	});
    document.getElementById("more-info-btn").addEventListener("click", toggleExtraInfo);
});

function redirectLogin() {
    chrome.action.setPopup({
        popup: "login.html"
    });
    window.location.href = "login.html";
}

function redirectSchoolSelect() {
    chrome.action.setPopup({
        popup: "school_select.html"
    });
    window.location.href = "school_select.html";
}

function logout() {
    chrome.storage.sync.remove(["accessToken", "schoolName", "userInfo", "schoolYear"]);
    chrome.storage.local.remove(["appointmentCache", "appointmentCacheTime", "dayStartTime"]);
    redirectLogin();
}

function updateAppointmentView() {
    let lessonElement = document.getElementById('lesson-info');
    let timeLeftElement = document.getElementById('time-left');
    let roomElement = document.getElementById('room-info');
    let dayElement = document.getElementById('day-info');
    let dayTimeLeftElement = document.getElementById('day-time-left');
	let doubleHourNotifier = document.getElementById('notification-double-hour');

    if(currentAppointment == null) {
        let nextAppointment = getEarliestAppointment();
        roomElement.innerHTML = "";

        if(nextAppointment == null) {
            timeLeftElement.innerHTML = "";
            lessonElement.innerHTML = "<b>Schooldag voorbij</b>";
            return;
        }

        setElements();

        let currentTime = getUnixSeconds();
        let timeLeft = nextAppointment.start - currentTime;

        if(timeLeft <= 0) {
            retrieveSchedule();
            return;
        }

        timeLeftElement.innerHTML = formatDuration(timeLeft);
        lessonElement.innerHTML = "<b>Geen les</b>";
		
		doubleHourNotifier.style.display = "none";
        return;
    }

    setElements();

    let currentTime = getUnixSeconds();
    let timeLeft = currentAppointment.end - currentTime;

    if(timeLeft <= 0) {
        retrieveSchedule();
        return;
    }

    let formattedSubjects = formatArray(currentAppointment.subjects);

    lessonElement.innerHTML = formattedSubjects + " van " + formatArray(currentAppointment.teachers);
    roomElement.innerHTML = "in lokaal " + formatArray(currentAppointment.locations);
	
	let doubleHour = getDoubleHour(appointmentsToday, currentAppointment);
	if(doubleHour != null) {
		timeLeft = doubleHour.end - currentTime;
	}
	
	doubleHourNotifier.style.display = doubleHour ? "block" : "none";
    timeLeftElement.innerHTML = formatDuration(timeLeft);
}

function clearAppointmentView() {
	document.getElementById('lesson-info').innerHTML = null;
	document.getElementById('time-left').innerHTML = null;
	document.getElementById('room-info').innerHTML = null;
	document.getElementById('day-info').innerHTML = null;
	document.getElementById('day-time-left').innerHTML = null;
	document.getElementById('notification-double-hour').style.display = "none";
}

function setElements() {
    latestAppointment = getLatestAppointment();
    setLessonsLeft(document.getElementById('day-info'));
    setDayTimeLeft(document.getElementById('day-time-left'));
    setDayProgress();
}

function setLessonsLeft(dayElement) {
    let lessonsLeft = appointmentsToday.length - (currentAppointment == null ? 0 : 1);

    if(lessonsLeft > 0) {
        dayElement.innerHTML = (currentAppointment == null ? "Zometeen" : "Hierna") + " nog " + lessonsLeft + (lessonsLeft == 1 ? " lesuur" : " lesuren");
    } else {
        dayElement.innerHTML = "Laatste les";
    }
}

function setDayTimeLeft(dayTimeElement) {
    let formattedTimeLeft = formatDuration(getTimeLeft());
    dayTimeElement.innerHTML = "Uit over " + formattedTimeLeft;
}

function getTimeLeft() {
    let latestAppointment = getLatestAppointment();
    let currentTime = getUnixSeconds();
    
    if(currentTime > latestAppointment.end) {
        return 0;
    }
    
    return latestAppointment.end - currentTime;
}

function setDayProgress() {
    let progressElement = document.getElementById("day-progress");

    let dayLength = latestAppointment.end - dayStartTime;
    let dayPosition = getUnixSeconds() - dayStartTime;
    let percentage = dayPosition / dayLength * 100;
    percentage = Math.round(percentage * 10) / 10; // Round to 1 decimal place

    progressElement.value = percentage;
}

let extraInfoVisible = false;

function toggleExtraInfo() {
    extraInfoVisible = !extraInfoVisible;
    chrome.storage.sync.set({extraInfoVisible: extraInfoVisible});
    applyExtraInfo();
}

function applyExtraInfo() {
    document.getElementById('extra-info').style.display = extraInfoVisible ? "block" : "none";
    document.getElementById('more-info-btn').innerHTML = extraInfoVisible ? "Minder info" : "Meer info";
}

function retrieveTeachers() {
    console.log("Retrieving teachers...");

    let url = getZermeloDomain()
            + "/users?archived=false&schoolInSchoolYear=" + schoolYear + "&fields=code%2ClastName%2Cprefix&isEmployee=true&access_token=" + accessToken;

    return fetch(url).then(r => r.json()).then(result => {
        let teachers = result.response.data;
        teachers.forEach(teacher => {
            let prefix = teacher.prefix;
            let lastName = teacher.lastName;
			
			if(!lastName) {
				return;
			}

            let commaIndex = lastName.indexOf(",");
            if(commaIndex != -1) {
                lastName = lastName.substring(0, commaIndex);
            }

            let fullName = (prefix ? prefix + " " : "") + lastName;
            teacherTranslations[teacher.code] = fullName;
        });

        console.log(teachers.length + " teachers retrieved!");
    });
}

function retrieveSchedule() {
    console.log("Retrieving schedule...");

    let startTime = getStartOfDay();
    let endTime = startTime + 86400;

    let url = getZermeloDomain()
                + "/appointments?user=~me&access_token=" + accessToken + "&start=" + startTime + "&end=" + endTime;

    fetch(url).then(r => r.json()).then(result => {
        appointmentsToday = sortAppointments(result.response.data);

        if(appointmentsToday.length != 0) {
            dayStartTime = appointmentsToday[0].start;
        } else {
            dayStartTime = 0;
        }

        console.log("Schedule retrieved!");

        retrieveTeachers().then(result => {
            onLoadingFinished();
        });
    });
}

function loadSchedule() {
    chrome.storage.local.get(['appointmentCache', 'appointmentCacheTime', 'dayStartTime'], function(result) {
        if(result.appointmentCache == null) {
            console.log("Appointments not cached (first startup?), retrieving");
            retrieveSchedule();
            return;
        }

        console.log("An appointment cache is available, using it");
        appointmentsToday = result.appointmentCache;
        dayStartTime = result.dayStartTime;
        onLoadingFinished();

        if(Date.now() - result.appointmentCacheTime > maxCacheTime) {
            console.log("The cache is however outdated, retrieving");
            retrieveSchedule();
        }
    });
}

function onLoadingFinished() {
    appointmentsToday.forEach(appointment => {
        appointment.teachers = translateArray(appointment.teachers, teacherTranslations);
    });

    let currentTime = getUnixSeconds();
    appointmentsToday = appointmentsToday.filter(item => {
        return currentTime <= item.end && item.valid && !item.cancelled;
    });

    currentAppointment = getCurrentAppointment(appointmentsToday);
    updateAppointmentView();

    chrome.storage.local.set({
        appointmentCache: appointmentsToday,
        appointmentCacheTime: Date.now(),
        dayStartTime: dayStartTime
    });

    console.log("Loading finished");
}

function getCurrentAppointment(appointments) {
    let currentTime = getUnixSeconds();

    let result = null;
    appointments.forEach(appointment => {
		if(!appointment.valid || appointment.cancelled) {
			return;
		}
		
        if(currentTime >= appointment.start && currentTime <= appointment.end) {
            result = appointment;
            return;
        }
    });

    return result;
}

function getDoubleHour(appointments, currentAppointment) {
	let result = null;
	appointments.forEach(appointment => {
		if(!appointment.valid || appointment.cancelled) {
			return;
		}
		
		if(appointment.start == currentAppointment.end &&
			arrayMatches(appointment.subjects, currentAppointment.subjects) && arrayMatches(appointment.locations, currentAppointment.locations) &&
			arrayMatches(appointment.teachers, currentAppointment.teachers) && arrayMatches(appointment.groups, currentAppointment.groups)) {
			result = appointment;
		}
	});
	
	return result;
}

function arrayMatches(array1, array2) {
	if(array1 == null || array2 == null) {
		return array1 == array2;
	}
	
	// hacky af, but the simplest way to do it
	// performance shouldn't matter cuz these arrays will be very small
	// (only a couple of elements at most, 90% of the time only a single element)
	return JSON.stringify(array1) == JSON.stringify(array2);
}

function getUnixSeconds() {
    return Math.floor(Date.now() / 1000);
}

function getZermeloDomain() {
    return "https://" + encodeURI(schoolName) + ".zportal.nl/api/v3";
}

function translateArray(inputArray, translationArray) {
    let copiedArray = [...inputArray];
    for(let i = 0; i < copiedArray.length; i++) {
        let translation = translationArray[copiedArray[i]];
        if(translation == undefined) {
            continue;
        }

        copiedArray[i] = translation;
    }

    return copiedArray;
}

function formatArray(array) {
    if(array.length == 0) {
        return "None";
    }

    if(array.length == 1) {
        return array[0];
    }

    return array.slice(0, array.length - 1).join(", ");
}

function formatDuration(duration) {
    let seconds = Math.floor(duration % 60);
    let minutes = Math.floor((duration / 60) % 60);
    let hours = Math.floor(duration / 3600);
  
    seconds = (seconds < 10) ? "0" + seconds : seconds;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    hours = (hours < 10) ? "0" + hours : hours;

    if(hours > 0) {
        return hours + "u " + minutes + "m " + seconds + "s";
    }

    return minutes + "m " + seconds + "s";
}

function getStartOfDay() {
    let date = new Date();
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth();
    let day = date.getUTCDate();

    let millisTime = Date.UTC(year, month, day, 0, 0, 0, 0);
    return Math.floor(millisTime / 1000);
}

function getEarliestAppointment() {
    let result = null;

    appointmentsToday.forEach(appointment => {
        if(!appointment.valid || appointment.cancelled) {
            return;
        }

        if(result == null || appointment.start < result.start) {
            result = appointment;
        }
    });

    return result;
}

function getLatestAppointment() {
    let result = null;

    appointmentsToday.forEach(appointment => {
        if(!appointment.valid || appointment.cancelled) {
            return;
        }

        if(result == null || appointment.end > result.end) {
            result = appointment;
        }
    });

    return result;
}

function sortAppointments(appointments) {
    let byStart = appointments.slice(0);
    byStart.sort(function(a, b) {
        return a.start - b.start;
    });
    return byStart;
}