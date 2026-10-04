import { auth, db } from "../firebase-config.js";

import {
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// =========================================================
// GET FORM
// =========================================================

const form =
    document.getElementById("clientSignupForm") ||
    document.querySelector("form");

const signupButton =
    document.getElementById("clientSignupButton") ||
    form?.querySelector('button[type="submit"]');


// =========================================================
// GET INPUTS
// =========================================================

const nameInput =
    document.getElementById("clientName");

const mobileInput =
    document.getElementById("clientMobile");

const emailInput =
    document.getElementById("clientEmail");

const passwordInput =
    document.getElementById("clientPassword");

const confirmPasswordInput =
    document.getElementById("clientConfirmPassword");

const termsInput =
    document.getElementById("clientTerms");

const message =
    document.getElementById("clientSignupMessage");


// =========================================================
// MESSAGE
// =========================================================

function showMessage(text, type = "error") {

    if (!message) {
        alert(text);
        return;
    }

    message.textContent = text;

    message.classList.remove(
        "success",
        "error"
    );

    message.classList.add(type);
}


// =========================================================
// PASSWORD TOGGLE
// =========================================================

document
    .querySelectorAll("[data-password-toggle]")
    .forEach(button => {

        button.addEventListener("click", () => {

            const targetId =
                button.getAttribute(
                    "data-password-toggle"
                );

            const input =
                document.getElementById(targetId);

            if (!input) return;

            if (input.type === "password") {

                input.type = "text";

                button.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            } else {

                input.type = "password";

                button.setAttribute(
                    "aria-label",
                    "Show password"
                );
            }
        });
    });


// =========================================================
// CHECK FORM
// =========================================================

if (!form) {

    console.error(
        "Handy: Client signup form was not found."
    );

    alert(
        "Signup form could not be loaded."
    );

} else {

    form.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();
            event.stopPropagation();


            // =================================================
            // READ VALUES
            // =================================================

            const name =
                nameInput?.value.trim() || "";

            const mobile =
                mobileInput?.value.trim() || "";

            const email =
                emailInput?.value.trim() || "";

            const password =
                passwordInput?.value || "";

            const confirmPassword =
                confirmPasswordInput?.value || "";


            // =================================================
            // VALIDATION
            // =================================================

            if (!name) {

                showMessage(
                    "Please enter your full name."
                );

                nameInput?.focus();

                return;
            }


            if (!mobile) {

                showMessage(
                    "Please enter your mobile number."
                );

                mobileInput?.focus();

                return;
            }


            if (!email) {

                showMessage(
                    "Please enter your email address."
                );

                emailInput?.focus();

                return;
            }


            if (!password) {

                showMessage(
                    "Please enter a password."
                );

                passwordInput?.focus();

                return;
            }


            if (password.length < 6) {

                showMessage(
                    "Password must be at least 6 characters."
                );

                passwordInput?.focus();

                return;
            }


            if (password !== confirmPassword) {

                showMessage(
                    "Passwords do not match."
                );

                confirmPasswordInput?.focus();

                return;
            }


            // Terms checkbox is only checked if it exists.
            // This prevents the signup process from breaking
            // if the checkbox ID is different in the HTML.

            if (
                termsInput &&
                !termsInput.checked
            ) {

                showMessage(
                    "Please agree to the Terms of Service and Privacy Policy."
                );

                return;
            }


            // =================================================
            // DISABLE BUTTON
            // =================================================

            if (signupButton) {

                signupButton.disabled = true;

                signupButton.classList.add(
                    "loading"
                );

                const buttonText =
                    signupButton.querySelector(
                        ".button-text"
                    );

                if (buttonText) {
                    buttonText.textContent =
                        "Creating Account...";
                }
            }


            try {

                // =================================================
                // STEP 1
                // CREATE FIREBASE AUTH ACCOUNT
                // =================================================

                const userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    userCredential.user;


                // =================================================
                // STEP 2
                // SAVE FIREBASE DISPLAY NAME
                // =================================================

                await updateProfile(
                    user,
                    {
                        displayName: name
                    }
                );


                // =================================================
                // STEP 3
                // CREATE FIRESTORE PROFILE
                // =================================================

                const userRef =
                    doc(
                        db,
                        "users",
                        user.uid
                    );


                await setDoc(
                    userRef,
                    {
                        name: name,
                        email: email,
                        phone: mobile,
                        role: "client",
                        profilePhoto: "",
                        createdAt: serverTimestamp()
                    }
                );


                // =================================================
                // SUCCESS
                // =================================================

                showMessage(
                    "Account created successfully.",
                    "success"
                );


                if (signupButton) {

                    const buttonText =
                        signupButton.querySelector(
                            ".button-text"
                        );

                    if (buttonText) {

                        buttonText.textContent =
                            "Account Created";

                    }
                }


                // =================================================
                // REDIRECT
                // =================================================

                setTimeout(() => {

                    window.location.href =
                        "./client-dashboard.html";

                }, 700);


            } catch (error) {

                console.error(
                    "HANDY SIGNUP ERROR:",
                    error
                );


                // =================================================
                // FIREBASE AUTH ERRORS
                // =================================================

                let errorMessage =
                    "Unable to create your account.";


                switch (error.code) {

                    case "auth/email-already-in-use":

                        errorMessage =
                            "This email is already registered.";

                        break;


                    case "auth/invalid-email":

                        errorMessage =
                            "Please enter a valid email address.";

                        break;


                    case "auth/weak-password":

                        errorMessage =
                            "Password must be at least 6 characters.";

                        break;


                    case "auth/network-request-failed":

                        errorMessage =
                            "Network error. Please check your internet connection.";

                        break;


                    case "auth/too-many-requests":

                        errorMessage =
                            "Too many attempts. Please try again later.";

                        break;


                    case "auth/operation-not-allowed":

                        errorMessage =
                            "Email and Password sign-in is not enabled in Firebase Authentication.";

                        break;


                    case "permission-denied":

                        errorMessage =
                            "Firebase blocked the database request. Check your Firestore rules.";

                        break;


                    case "failed-precondition":

                        errorMessage =
                            "Firestore is not configured correctly.";

                        break;


                    case "unavailable":

                        errorMessage =
                            "Firebase is temporarily unavailable.";

                        break;


                    default:

                        errorMessage =
                            error.message ||
                            "Something went wrong.";

                        break;
                }


                showMessage(
                    errorMessage
                );


                // =================================================
                // RESTORE BUTTON
                // =================================================

                if (signupButton) {

                    signupButton.disabled = false;

                    signupButton.classList.remove(
                        "loading"
                    );


                    const buttonText =
                        signupButton.querySelector(
                            ".button-text"
                        );


                    if (buttonText) {

                        buttonText.textContent =
                            "Create Client Account";
                    }
                }
            }

        }
    );
}