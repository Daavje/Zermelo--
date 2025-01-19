document.addEventListener('DOMContentLoaded', () => {
    let loginCodeElement = document.getElementById("login-code");
    let schoolNameElement = document.getElementById("school-name");
    let loginBtn = document.getElementById("login-btn");
    let autoFillBtn = document.getElementById("auto-fill-btn");

    let errorText = document.getElementById("error-msg");

    loginCodeElement.addEventListener("keypress", function(e) {
        if(loginCodeElement.value.length >= 12 || isLetter(e.keyCode)) {
            e.preventDefault();
        }
    });
    
    loginBtn.addEventListener("click", function() {
        loginBtn.disabled = true;
        errorText.style.display = 'none';

        let loginCode = loginCodeElement.value;
        let schoolName = schoolNameElement.value;

        let url = "https://" + encodeURI(schoolName) + ".zportal.nl/api/v2/oauth/token";
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=authorization_code&code=' + encodeURI(loginCode)
        }).then(response => {
            if(!response.ok) {
                throw new Error(response.statusText);
            }
            return response.json();
        }).then(response => {
            let accessToken = response.access_token;
            getUserInfo(schoolName, accessToken).then(userInfo => {
                saveData(schoolName, accessToken, userInfo);
            });
        }).catch(error => {
            console.log("Request error: " + error);
            loginBtn.disabled = false;
            errorText.style.display = 'block';
        });
    });

   /* chrome.tabs.getSelected(null, function(tab) {
        let re = /^\S+.zportal.nl\/main\/#connectionsModule-connectApp$/;
        if(!tab.url.match(re)) {
            return;
        }

        autoFillBtn.style.display = "block";
        autoFillBtn.addEventListener("click", function() {
            chrome.tabs.executeScript(null, {code: '(' + zermeloInject + ')();'}, function(result) {
                schoolNameElement.value = result[0]["schoolName"];
                loginCodeElement.value = result[0]["loginCode"];
            });
        });
    });*/
});

function zermeloInject() {
    let loginCode = document.getElementById("isc_8E").childNodes[0].childNodes[0].childNodes[0].childNodes[0].innerHTML.replace(/ /g, "");
    let schoolName = document.getElementById("isc_8C").childNodes[0].childNodes[0].childNodes[0].childNodes[0].innerHTML;

    return {schoolName, loginCode};
}

function redirectMain() {
    chrome.action.setPopup({
        popup: "popup.html"
    });
    window.location.href = "popup.html";
}

function saveData(schoolName, authorizationCode, userInfo) {
    chrome.storage.sync.set({
        "accessToken": authorizationCode,
        "schoolName": schoolName,
        "userInfo": userInfo
    }, function() {
        redirectMain();
    });
}

function isLetter(keyCode) {
    return keyCode > 31 && (keyCode < 48 || keyCode > 57);
}

function getUserInfo(siteName, accessToken) {
    let url = "https://" + siteName + ".zportal.nl/api/v3/users/~me?access_token=" + accessToken;

    return fetch(url).then(r => r.json()).then(result => {
        let data = result.response.data[0];
        data.fullName = data.firstName + " " + data.lastName;
        return data;
    });
}