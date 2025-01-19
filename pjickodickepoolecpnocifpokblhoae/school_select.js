let accessToken = null;
let schoolName = null;

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['accessToken', 'schoolName'], function(result) {
        accessToken = result.accessToken;
        schoolName = result.schoolName;

        let selectElement = document.getElementById("school-select");
        getSchools().then(schools => {
            schools.forEach(school => {
                let option = document.createElement("option");
                option.text = school.name;
                option.value = school.id;
                selectElement.add(option);
            });

            onSchoolSelect(selectElement, yearSelectElement);
        });

        let yearSelectElement = document.getElementById("year-select");
        selectElement.addEventListener("change", function(e) {
            onSchoolSelect(selectElement, yearSelectElement);
        });

        let continueButton = document.getElementById("continue-btn");
        continueButton.addEventListener("click", function(e) {
            let schoolyear = yearSelectElement.value;

            chrome.storage.sync.set({schoolYear: schoolyear}, function() {
                redirectMain();
            });
        });
    });
});

function redirectMain() {
    chrome.action.setPopup({
        popup: "popup.html"
    });
    window.location.href = "popup.html";
}

function onSchoolSelect(selectElement, yearSelectElement) {
    getYears(selectElement.value).then(years => {
        yearSelectElement.innerHTML = "";
        years.forEach(year => {
            if(year.archived) {
                return;
            }

            let option = document.createElement("option");
            option.text = year.name;
            option.value = year.id;
            yearSelectElement.add(option);
        });
    });
}

function getSchools() {
    return fetch("https://" + schoolName + ".zportal.nl/api/v3/schools?access_token=" + accessToken)
        .then(r => r.json())
        .then(result => {
            return result.response.data;
        });
}

function getYears(school) {
    return fetch("https://" + schoolName + ".zportal.nl/api/v3/schoolsinschoolyears?access_token=" + accessToken + "&school=" + school)
        .then(r => r.json())
        .then(result => {
            return sortYears(result.response.data);
        });
}

function sortYears(years) {
    let byYear = years.slice(0);
    byYear.sort(function(a, b) {
        return b.year - a.year;
    });
    return byYear;
}