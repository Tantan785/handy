import { auth, db } from "./firebase-config.js";

import {
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


const form = document.getElementById("loginForm");
const emailInput = document.getElementById("loginIdentifier");
const passwordInput = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const message = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");


function showMessage(text, type = "error") {

    if (!message) {
        alert(text);
        return;
    }

    message.textContent = text;

    message.classList.remove(
        "error",
        "success"
    );

    message.classList.add(type);
}


/* PASSWORD */

if (togglePassword && passwordInput) {

    togglePassword.addEventListener("click", () => {

        const isPassword =
            passwordInput.type === "password";

        passwordInput.type =
            isPassword ? "text" : "password";

        togglePassword.setAttribute(
            "aria-label",
            isPassword
                ? "Hide password"
                : "Show password"
        );

    });

}


/* LOGIN */

if (form) {

    form.addEventListener("submit", async (event) => {

        event.preventDefault();
        event.stopPropagation();


        const email =
            emailInput.value.trim();

        const password =
            passwordInput.value;


        if (!email) {

            showMessage(
                "Please enter your email address."
            );

            emailInput.focus();

            return;
        }


        if (!password) {

            showMessage(
                "Please enter your password."
            );

            passwordInput.focus();

            return;
        }


        loginButton.disabled = true;
        loginButton.classList.add("loading");


        const buttonText =
            loginButton.querySelector(".button-text");


        if (buttonText) {
            buttonText.textContent =
                "Logging in...";
        }


        try {

            /* FIREBASE AUTH */

            const credential =
                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                credential.user;


            /* FIRESTORE PROFILE */

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );


            const userSnapshot =
                await getDoc(userRef);


            if (!userSnapshot.exists()) {

                throw new Error(
                    "Your Handy account profile was not found."
                );
            }


            const userData =
                userSnapshot.data();


            /* CLIENT */

            if (userData.role === "client") {

                showMessage(
                    "Login successful.",
                    "success"
                );


                setTimeout(() => {

                    window.location.href =
                        "client/client-dashboard.html";

                }, 500);

                return;
            }


            /* HANDYMAN */

            if (userData.role === "handyman") {

                showMessage(
                    "Login successful.",
                    "success"
                );


                setTimeout(() => {

                    window.location.href =
                        "handyman/handyman-dashboard.html";

                }, 500);

                return;
            }


            throw new Error(
                "Your account role is not configured."
            );


        } catch (error) {

            console.error(
                "HANDY LOGIN ERROR:",
                error
            );


            let errorMessage =
                "Unable to log in.";


            switch (error.code) {

                case "auth/invalid-credential":
                    errorMessage =
                        "Incorrect email or password.";
                    break;

                case "auth/invalid-email":
                    errorMessage =
                        "Please enter a valid email address.";
                    break;

                case "auth/user-not-found":
                    errorMessage =
                        "No account was found with this email.";
                    break;

                case "auth/wrong-password":
                    errorMessage =
                        "Incorrect email or password.";
                    break;

                case "auth/too-many-requests":
                    errorMessage =
                        "Too many login attempts. Try again later.";
                    break;

                case "auth/network-request-failed":
                    errorMessage =
                        "Network error. Check your internet connection.";
                    break;

                case "auth/user-disabled":
                    errorMessage =
                        "This account has been disabled.";
                    break;

                default:
                    errorMessage =
                        error.message ||
                        "Unable to log in.";
                    break;
            }


            showMessage(
                errorMessage
            );


            loginButton.disabled = false;
            loginButton.classList.remove("loading");


            if (buttonText) {
                buttonText.textContent =
                    "Log in";
            }

        }

    });

}