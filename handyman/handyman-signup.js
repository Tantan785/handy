import {
    createUserWithEmailAndPassword,
    updateProfile,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    auth,
    db
} from "../firebase-config.js";


/* =========================================================
   ELEMENTS
========================================================= */

let form = null;
let nameInput = null;
let mobileInput = null;
let emailInput = null;
let passwordInput = null;
let confirmPasswordInput = null;
let serviceCategoryInput = null;
let serviceNameInput = null;
let experienceInput = null;
let termsInput = null;
let message = null;
let signupButton = null;


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(
    text,
    type = "error"
) {

    if (!message) {
        console.warn("HANDY:", text);
        return;
    }

    message.textContent = text;

    message.className =
        "form-message " + type;
}


/* =========================================================
   LOADING STATE
========================================================= */

function setLoading(
    loading
) {

    if (!signupButton) return;

    signupButton.disabled =
        loading;

    signupButton.classList.toggle(
        "loading",
        loading
    );

    const buttonText =
        signupButton.querySelector(
            ".button-text"
        );

    const buttonArrow =
        signupButton.querySelector(
            ".button-arrow"
        );

    if (buttonText) {

        buttonText.textContent =
            loading
                ? "Creating account..."
                : "Continue";

    }

    if (buttonArrow) {

        buttonArrow.style.opacity =
            loading
                ? "0"
                : "1";

    }

}


function initializeSignupPage() {

    form =
        document.getElementById("handymanSignupForm");

    nameInput =
        document.getElementById("handymanName");

    mobileInput =
        document.getElementById("handymanMobile");

    emailInput =
        document.getElementById("handymanEmail");

    passwordInput =
        document.getElementById("handymanPassword");

    confirmPasswordInput =
        document.getElementById("handymanConfirmPassword");

    serviceCategoryInput =
        document.getElementById("serviceCategory");

    serviceNameInput =
        document.getElementById("serviceName");

    experienceInput =
        document.getElementById("experience");

    termsInput =
        document.getElementById("handymanTerms");

    message =
        document.getElementById("handymanSignupMessage");

    signupButton =
        document.getElementById("handymanSignupButton");


    /* =========================================================
       PASSWORD TOGGLE
    ========================================================= */

    document
        .querySelectorAll(
            "[data-password-toggle]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const inputId =
                        button.dataset.passwordToggle;

                    const input =
                        document.getElementById(
                            inputId
                        );

                    if (!input) return;

                    const showing =
                        input.type === "text";

                    input.type =
                        showing
                            ? "password"
                            : "text";

                    button.setAttribute(
                        "aria-label",
                        showing
                            ? "Show password"
                            : "Hide password"
                    );

                }
            );

        });


    /* =========================================================
       MOBILE INPUT CLEANING
    ========================================================= */

    if (mobileInput) {

        mobileInput.addEventListener(
            "input",
            () => {

                mobileInput.value =
                    mobileInput.value.replace(
                        /[^0-9+\-\s]/g,
                        ""
                    );

            }
        );

    }


    /* =========================================================
       FIREBASE ERROR
    ========================================================= */

    function getFirebaseErrorMessage(
        error
    ) {

        console.error(
            "HANDYMAN SIGNUP ERROR:",
            error
        );

        switch (error?.code) {

            case "auth/email-already-in-use":

                return "That email address is already registered.";

            case "auth/invalid-email":

                return "Please enter a valid email address.";

            case "auth/weak-password":

                return "Your password must be at least 6 characters.";

            case "auth/network-request-failed":

                return "Network error. Please check your internet connection.";

            case "permission-denied":

                return "Firestore permission denied. Please check your Firebase rules.";

            case "unavailable":

                return "Firebase is temporarily unavailable. Please try again.";

            case "failed-precondition":

                return "Firestore is not configured correctly.";

            default:

                if (
                    error?.message &&
                    error.message.includes(
                        "Missing or insufficient permissions"
                    )
                ) {

                    return "Firestore permission denied. Please check your Firebase rules.";

                }

                return (
                    error?.message ||
                    "Unable to create your account. Please try again."
                );

        }

    }


    /* =========================================================
       FORM SUBMIT
    ========================================================= */

    if (!form) {

        console.error(
            "HANDY: handymanSignupForm was not found."
        );

    } else {

        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();
                event.stopPropagation();


                /* =============================================
                   GET VALUES
                ============================================= */

                const name =
                    nameInput?.value.trim() || "";

                const mobile =
                    mobileInput?.value.trim() || "";

                const email =
                    emailInput?.value.trim().toLowerCase() || "";

                const password =
                    passwordInput?.value || "";

                const confirmPassword =
                    confirmPasswordInput?.value || "";

                const serviceCategory =
                    serviceCategoryInput?.value || "";

                const serviceName =
                    serviceNameInput?.value.trim() || "";

                const experience =
                    experienceInput?.value || "";

                const termsAccepted =
                    termsInput?.checked === true;


                /* =============================================
                   VALIDATION
                ============================================= */

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

                if (
                    mobile.replace(
                        /\D/g,
                        ""
                    ).length < 10
                ) {

                    showMessage(
                        "Please enter a valid mobile number."
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

                if (
                    !email.includes("@")
                ) {

                    showMessage(
                        "Please enter a valid email address."
                    );

                    emailInput?.focus();

                    return;

                }

                if (
                    password.length < 6
                ) {

                    showMessage(
                        "Password must be at least 6 characters."
                    );

                    passwordInput?.focus();

                    return;

                }

                if (
                    password !==
                    confirmPassword
                ) {

                    showMessage(
                        "Passwords do not match."
                    );

                    confirmPasswordInput?.focus();

                    return;

                }

                if (!serviceCategory) {

                    showMessage(
                        "Please select your primary service."
                    );

                    serviceCategoryInput?.focus();

                    return;

                }

                if (!serviceName) {

                    showMessage(
                        "Please enter your service name."
                    );

                    serviceNameInput?.focus();

                    return;

                }

                if (!experience) {

                    showMessage(
                        "Please select your years of experience."
                    );

                    experienceInput?.focus();

                    return;

                }

                if (!termsAccepted) {

                    showMessage(
                        "Please agree to the Terms of Service and Privacy Policy."
                    );

                    return;

                }


                /* =============================================
                   START
                ============================================= */

                setLoading(true);

                showMessage(
                    "Creating your professional account...",
                    "success"
                );


                let createdFirebaseUser =
                    null;


                try {

                    console.log(
                        "HANDYMAN SIGNUP STARTED"
                    );


                    /* =========================================
                       FIREBASE AUTH
                    ========================================= */

                    const credential =
                        await createUserWithEmailAndPassword(
                            auth,
                            email,
                            password
                        );

                    createdFirebaseUser =
                        credential.user;

                    console.log(
                        "Firebase Auth account created:",
                        createdFirebaseUser.uid
                    );


                    /* =========================================
                       FIREBASE DISPLAY NAME
                    ========================================= */

                    await updateProfile(
                        createdFirebaseUser,
                        {
                            displayName: name
                        }
                    );


                    /* =========================================
                       FIRESTORE REFERENCE
                    ========================================= */

                    const userRef =
                        doc(
                            db,
                            "users",
                            createdFirebaseUser.uid
                        );


                    /* =========================================
                       HANDYMAN PROFILE
                    ========================================= */

                    const userData = {

                        uid:
                            createdFirebaseUser.uid,

                        id:
                            createdFirebaseUser.uid,

                        name:
                            name,

                        fullName:
                            name,

                        email:
                            email,

                        phone:
                            mobile,

                        mobile:
                            mobile,

                        role:
                            "handyman",

                        profilePhoto:
                            "",

                        serviceCategory:
                            serviceCategory,

                        serviceName:
                            serviceName,

                        experience:
                            experience,

                        verified:
                            false,

                        verificationStatus:
                            "pending",

                        availability:
                            true,

                        rating:
                            0,

                        reviewCount:
                            0,

                        completedJobs:
                            0,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    };


                    console.log(
                        "Saving handyman profile:",
                        userData
                    );


                    /* =========================================
                       SAVE FIRESTORE
                    ========================================= */

                    await setDoc(
                        userRef,
                        userData
                    );


                    console.log(
                        "Handyman profile saved."
                    );


                    /* =========================================
                       VERIFY FIRESTORE
                    ========================================= */

                    const savedProfile =
                        await getDoc(
                            userRef
                        );


                    if (
                        !savedProfile.exists()
                    ) {

                        throw new Error(
                            "Account was created but the Handy profile was not saved."
                        );

                    }


                    console.log(
                        "Verified Firestore profile:",
                        savedProfile.data()
                    );


                    /* =========================================
                       SUCCESS
                    ========================================= */

                    showMessage(
                        "Account created successfully. Redirecting...",
                        "success"
                    );


                    setTimeout(
                        () => {

                            window.location.href =
                                "../login.html?registered=handyman";

                        },
                        800
                    );


                } catch (error) {

                    console.error(
                        "HANDYMAN SIGNUP ERROR:",
                        error
                    );


                    /* =========================================
                       ROLLBACK AUTH
                    ========================================= */

                    if (
                        createdFirebaseUser &&
                        error?.code !==
                            "auth/email-already-in-use"
                    ) {

                        try {

                            await deleteUser(
                                createdFirebaseUser
                            );

                            console.log(
                                "Firebase Auth account rolled back."
                            );

                        } catch (
                            rollbackError
                        ) {

                            console.error(
                                "Could not rollback Auth account:",
                                rollbackError
                            );

                        }

                    }


                    showMessage(
                        getFirebaseErrorMessage(
                            error
                        )
                    );


                    setLoading(false);

                }

            }
        );

    }

}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSignupPage);
} else {
    initializeSignupPage();
}