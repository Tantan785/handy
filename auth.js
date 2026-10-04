/* =========================================================
   HANDY AUTH SYSTEM
   auth.js
   Firebase Authentication + Firestore
   ========================================================= */

import {
    auth,
    db
} from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    deleteUser,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


(function () {

    "use strict";


    /* =====================================================
       PAGE TRANSITION
    ===================================================== */

    function initializePage() {

        if (
            document.body &&
            !document.body.classList.contains("page-ready")
        ) {
            document.body.classList.add("page-ready");
        }

    }


    /* =====================================================
       HELPERS
    ===================================================== */

    function getValue(form, selectors) {

        if (!form) {
            return "";
        }

        for (const selector of selectors) {

            const element =
                form.querySelector(selector);

            if (
                element &&
                element.value !== undefined
            ) {

                return String(
                    element.value
                ).trim();

            }

        }

        return "";

    }


    function getMessageElement(ids) {

        for (const id of ids) {

            const element =
                document.getElementById(id);

            if (element) {
                return element;
            }

        }

        return null;

    }


    function showMessage(
        element,
        message,
        type = "error"
    ) {

        if (!element) {

            console.warn(
                "HANDY AUTH:",
                message
            );

            return;

        }

        element.textContent =
            message;

        element.className =
            `form-message ${type}`;

    }


    function clearMessage(element) {

        if (!element) {
            return;
        }

        element.textContent =
            "";

        element.className =
            "form-message";

    }


    function setButtonLoading(
        button,
        loading,
        loadingText = "Creating account..."
    ) {

        if (!button) {
            return;
        }

        button.disabled =
            loading;

        const buttonText =
            button.querySelector(
                ".button-text"
            );

        if (!buttonText) {
            return;
        }

        if (loading) {

            if (
                !button.dataset.originalText
            ) {

                button.dataset.originalText =
                    buttonText.textContent;

            }

            buttonText.textContent =
                loadingText;

        } else {

            buttonText.textContent =
                button.dataset.originalText ||
                "Continue";

        }

    }


    /* =====================================================
       FIREBASE ERROR HANDLER
    ===================================================== */

    function getFirebaseErrorMessage(error) {

        console.error(
            "HANDY FIREBASE ERROR:",
            error
        );

        switch (error?.code) {

            case "auth/email-already-in-use":
                return "An account with this email already exists.";

            case "auth/invalid-email":
                return "Please enter a valid email address.";

            case "auth/weak-password":
                return "Password must be at least 6 characters.";

            case "auth/invalid-credential":
                return "Invalid email or password.";

            case "auth/user-not-found":
                return "Invalid email or password.";

            case "auth/wrong-password":
                return "Invalid email or password.";

            case "auth/too-many-requests":
                return "Too many attempts. Please try again later.";

            case "auth/network-request-failed":
                return "Network error. Please check your internet connection.";

            case "permission-denied":
                return "Firestore permission denied.";

            case "unavailable":
                return "Firebase is temporarily unavailable.";

            case "failed-precondition":
                return "Firebase Firestore is not configured correctly.";

            default:

                if (
                    error?.message &&
                    error.message.includes(
                        "Missing or insufficient permissions"
                    )
                ) {

                    return "Firestore permission denied.";

                }

                return (
                    error?.message ||
                    "Something went wrong. Please try again."
                );

        }

    }


    /* =====================================================
       CURRENT USER
    ===================================================== */

    function getCurrentUser() {

        return auth.currentUser || null;

    }


    /* =====================================================
       REGISTER CLIENT
    ===================================================== */

    async function registerClient(form) {

        const message =
            getMessageElement([
                "clientSignupMessage",
                "clientMessage"
            ]);

        clearMessage(message);


        const fullName =
            getValue(
                form,
                [
                    "#clientFullName",
                    "#fullName",
                    '[name="fullName"]',
                    '[name="name"]'
                ]
            );


        const email =
            getValue(
                form,
                [
                    "#clientEmail",
                    "#email",
                    '[name="email"]'
                ]
            ).toLowerCase();


        const mobile =
            getValue(
                form,
                [
                    "#clientMobile",
                    "#mobile",
                    "#phone",
                    '[name="mobile"]',
                    '[name="phone"]'
                ]
            );


        const password =
            getValue(
                form,
                [
                    "#clientPassword",
                    "#password",
                    '[name="password"]'
                ]
            );


        const confirmPassword =
            getValue(
                form,
                [
                    "#clientConfirmPassword",
                    "#confirmPassword",
                    '[name="confirmPassword"]',
                    '[name="password_confirmation"]'
                ]
            );


        /* =================================================
           VALIDATION
        ================================================= */

        if (
            !fullName ||
            !email ||
            !mobile ||
            !password ||
            !confirmPassword
        ) {

            showMessage(
                message,
                "Please complete all required fields."
            );

            return;

        }


        if (
            password !==
            confirmPassword
        ) {

            showMessage(
                message,
                "Passwords do not match."
            );

            return;

        }


        if (
            password.length < 6
        ) {

            showMessage(
                message,
                "Password must be at least 6 characters."
            );

            return;

        }


        const button =
            document.getElementById(
                "clientSignupButton"
            );


        let createdFirebaseUser =
            null;


        try {

            setButtonLoading(
                button,
                true,
                "Creating account..."
            );


            console.log(
                "HANDY: Creating client account..."
            );


            /* =================================================
               FIREBASE AUTH
            ================================================= */

            const credential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            createdFirebaseUser =
                credential.user;


            console.log(
                "HANDY: Client Auth created:",
                createdFirebaseUser.uid
            );


            /* =================================================
               DISPLAY NAME
            ================================================= */

            await updateProfile(
                createdFirebaseUser,
                {
                    displayName:
                        fullName
                }
            );


            /* =================================================
               FIRESTORE
            ================================================= */

            const userRef =
                doc(
                    db,
                    "users",
                    createdFirebaseUser.uid
                );


            const userData = {

                uid:
                    createdFirebaseUser.uid,

                id:
                    createdFirebaseUser.uid,

                role:
                    "client",

                name:
                    fullName,

                fullName:
                    fullName,

                email:
                    email,

                phone:
                    mobile,

                mobile:
                    mobile,

                profilePhoto:
                    "",

                createdAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()

            };


            console.log(
                "HANDY: Saving client profile..."
            );


            await setDoc(
                userRef,
                userData
            );


            /* =================================================
               VERIFY FIRESTORE
            ================================================= */

            const verify =
                await getDoc(
                    userRef
                );


            if (
                !verify.exists()
            ) {

                throw new Error(
                    "Client profile was not saved to Firestore."
                );

            }


            console.log(
                "HANDY: Client profile verified."
            );


            /* =================================================
               SUCCESS
            ================================================= */

            showMessage(
                message,
                "Account created successfully. Redirecting...",
                "success"
            );


            setTimeout(
                () => {

                    window.location.href =
                        "../login.html?registered=client";

                },
                700
            );


        } catch (error) {

            console.error(
                "HANDY CLIENT SIGNUP ERROR:",
                error
            );


            /* =================================================
               ROLLBACK FIREBASE AUTH
            ================================================= */

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
                        "HANDY: Client Auth account rolled back."
                    );

                } catch (rollbackError) {

                    console.error(
                        "HANDY: Could not rollback client account:",
                        rollbackError
                    );

                }

            }


            showMessage(
                message,
                getFirebaseErrorMessage(error)
            );


            setButtonLoading(
                button,
                false
            );

        }

    }


    /* =====================================================
       REGISTER HANDYMAN
    ===================================================== */

    async function registerHandyman(form) {

        const message =
            getMessageElement([
                "handymanSignupMessage",
                "handymanMessage"
            ]);


        clearMessage(
            message
        );


        /* =================================================
           GET HANDYMAN VALUES
        ================================================= */

        const fullName =
            getValue(
                form,
                [
                    "#handymanName",
                    "#handymanFullName",
                    "#fullName",
                    '[name="fullName"]',
                    '[name="name"]'
                ]
            );


        const email =
            getValue(
                form,
                [
                    "#handymanEmail",
                    "#email",
                    '[name="email"]'
                ]
            ).toLowerCase();


        const mobile =
            getValue(
                form,
                [
                    "#handymanMobile",
                    "#mobile",
                    "#phone",
                    '[name="mobile"]',
                    '[name="phone"]'
                ]
            );


        const password =
            getValue(
                form,
                [
                    "#handymanPassword",
                    "#password",
                    '[name="password"]'
                ]
            );


        const confirmPassword =
            getValue(
                form,
                [
                    "#handymanConfirmPassword",
                    "#confirmPassword",
                    '[name="confirmPassword"]',
                    '[name="password_confirmation"]'
                ]
            );


        const serviceCategory =
            getValue(
                form,
                [
                    "#serviceCategory",
                    "#handymanService",
                    '[name="serviceCategory"]',
                    '[name="service"]'
                ]
            );


        const serviceName =
            getValue(
                form,
                [
                    "#serviceName",
                    '[name="serviceName"]'
                ]
            );


        const experience =
            getValue(
                form,
                [
                    "#experience",
                    "#handymanExperience",
                    '[name="experience"]'
                ]
            );


        const terms =
            document.getElementById(
                "handymanTerms"
            );


        const termsAccepted =
            terms
                ? terms.checked
                : false;


        console.log(
            "HANDYMAN SIGNUP DATA:",
            {
                fullName,
                email,
                mobile,
                serviceCategory,
                serviceName,
                experience,
                termsAccepted
            }
        );


        /* =================================================
           VALIDATION
        ================================================= */

        if (!fullName) {

            showMessage(
                message,
                "Please enter your full name."
            );

            return;

        }


        if (!mobile) {

            showMessage(
                message,
                "Please enter your mobile number."
            );

            return;

        }


        if (
            mobile.replace(
                /\D/g,
                ""
            ).length < 10
        ) {

            showMessage(
                message,
                "Please enter a valid mobile number."
            );

            return;

        }


        if (!email) {

            showMessage(
                message,
                "Please enter your email address."
            );

            return;

        }


        if (
            !email.includes("@")
        ) {

            showMessage(
                message,
                "Please enter a valid email address."
            );

            return;

        }


        if (
            password.length < 6
        ) {

            showMessage(
                message,
                "Password must be at least 6 characters."
            );

            return;

        }


        if (
            password !==
            confirmPassword
        ) {

            showMessage(
                message,
                "Passwords do not match."
            );

            return;

        }


        if (!serviceCategory) {

            showMessage(
                message,
                "Please select your primary service."
            );

            return;

        }


        if (!serviceName) {

            showMessage(
                message,
                "Please enter your service name."
            );

            return;

        }


        if (!experience) {

            showMessage(
                message,
                "Please select your years of experience."
            );

            return;

        }


        if (!termsAccepted) {

            showMessage(
                message,
                "Please agree to the Terms of Service and Privacy Policy."
            );

            return;

        }


        const button =
            document.getElementById(
                "handymanSignupButton"
            );


        let createdFirebaseUser =
            null;


        try {

            setButtonLoading(
                button,
                true,
                "Creating account..."
            );


            showMessage(
                message,
                "Creating your professional account...",
                "success"
            );


            console.log(
                "HANDY: Creating handyman Firebase account..."
            );


            /* =================================================
               FIREBASE AUTH
            ================================================= */

            const credential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            createdFirebaseUser =
                credential.user;


            console.log(
                "HANDY: Handyman Auth created:",
                createdFirebaseUser.uid
            );


            /* =================================================
               FIREBASE DISPLAY NAME
            ================================================= */

            await updateProfile(
                createdFirebaseUser,
                {
                    displayName:
                        fullName
                }
            );


            /* =================================================
               FIRESTORE REFERENCE
            ================================================= */

            const userRef =
                doc(
                    db,
                    "users",
                    createdFirebaseUser.uid
                );


            /* =================================================
               HANDYMAN PROFILE
            ================================================= */

            const userData = {

                uid:
                    createdFirebaseUser.uid,

                id:
                    createdFirebaseUser.uid,

                role:
                    "handyman",

                name:
                    fullName,

                fullName:
                    fullName,

                email:
                    email,

                phone:
                    mobile,

                mobile:
                    mobile,

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
                "HANDY: Saving handyman profile...",
                userData
            );


            /* =================================================
               SAVE FIRESTORE
            ================================================= */

            await setDoc(
                userRef,
                userData
            );


            console.log(
                "HANDY: Handyman profile saved."
            );


            /* =================================================
               VERIFY FIRESTORE
            ================================================= */

            const verify =
                await getDoc(
                    userRef
                );


            if (
                !verify.exists()
            ) {

                throw new Error(
                    "Handyman profile was not saved to Firestore."
                );

            }


            console.log(
                "HANDY: Handyman Firestore profile verified.",
                verify.data()
            );


            /* =================================================
               SUCCESS
            ================================================= */

            showMessage(
                message,
                "Account created successfully. Redirecting...",
                "success"
            );


            setTimeout(
                () => {

                    window.location.href =
                        "../login.html?registered=handyman";

                },
                700
            );


        } catch (error) {

            console.error(
                "HANDY HANDYMAN SIGNUP ERROR:",
                error
            );


            /* =================================================
               ROLLBACK AUTH IF FIRESTORE FAILS
            ================================================= */

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
                        "HANDY: Handyman Auth account rolled back."
                    );

                } catch (rollbackError) {

                    console.error(
                        "HANDY: Could not rollback Auth account:",
                        rollbackError
                    );

                }

            }


            showMessage(
                message,
                getFirebaseErrorMessage(error)
            );


            setButtonLoading(
                button,
                false
            );

        }

    }


    /* =====================================================
       LOGIN
    ===================================================== */

    async function login(form) {

        const message =
            getMessageElement([
                "loginMessage"
            ]);


        clearMessage(
            message
        );


        const email =
            getValue(
                form,
                [
                    "#email",
                    "#loginEmail",
                    '[name="email"]'
                ]
            ).toLowerCase();


        const password =
            getValue(
                form,
                [
                    "#password",
                    "#loginPassword",
                    '[name="password"]'
                ]
            );


        if (
            !email ||
            !password
        ) {

            showMessage(
                message,
                "Please enter your email and password."
            );

            return;

        }


        const button =
            document.getElementById(
                "loginButton"
            );


        try {

            setButtonLoading(
                button,
                true,
                "Logging in..."
            );


            console.log(
                "HANDY: Logging in..."
            );


            /* =================================================
               FIREBASE AUTH LOGIN
            ================================================= */

            const credential =
                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                credential.user;


            console.log(
                "HANDY: Login successful:",
                user.uid
            );


            /* =================================================
               FIRESTORE PROFILE
            ================================================= */

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );


            const snapshot =
                await getDoc(
                    userRef
                );


            if (
                !snapshot.exists()
            ) {

                throw new Error(
                    "Your Firebase account exists, but your Handy profile was not found."
                );

            }


            const userData =
                snapshot.data();


            console.log(
                "HANDY: User profile:",
                userData
            );


            if (
                userData.role !==
                    "client" &&
                userData.role !==
                    "handyman"
            ) {

                throw new Error(
                    "Invalid Handy account role."
                );

            }


            showMessage(
                message,
                "Login successful. Redirecting...",
                "success"
            );


            setTimeout(
                () => {

                    if (
                        userData.role ===
                        "client"
                    ) {

                        window.location.href =
                            "./client/client-dashboard.html";

                        return;

                    }


                    if (
                        userData.role ===
                        "handyman"
                    ) {

                        window.location.href =
                            "./handyman/handyman-dashboard.html";

                        return;

                    }

                },
                500
            );


        } catch (error) {

            console.error(
                "HANDY LOGIN ERROR:",
                error
            );


            showMessage(
                message,
                getFirebaseErrorMessage(error)
            );


            setButtonLoading(
                button,
                false
            );

        }

    }


    /* =====================================================
       LOGOUT
    ===================================================== */

    async function logout() {

        try {

            await signOut(
                auth
            );


            window.location.href =
                "./index.html";


        } catch (error) {

            console.error(
                "HANDY LOGOUT ERROR:",
                error
            );

        }

    }


    /* =====================================================
       PASSWORD TOGGLE
    ===================================================== */

    function initializePasswordToggles() {

        document
            .querySelectorAll(
                ".password-toggle"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            const targetId =
                                button.dataset.target;


                            const input =
                                targetId
                                    ? document.getElementById(
                                          targetId
                                      )
                                    : button
                                          .closest(
                                              ".password-field"
                                          )
                                          ?.querySelector(
                                              "input"
                                          );


                            if (!input) {
                                return;
                            }


                            input.type =
                                input.type ===
                                "password"
                                    ? "text"
                                    : "password";


                            button.classList.toggle(
                                "active",
                                input.type ===
                                    "text"
                            );

                        }
                    );

                }
            );

    }


    /* =====================================================
       REGISTERED MESSAGE
    ===================================================== */

    function showRegisteredMessage() {

        const params =
            new URLSearchParams(
                window.location.search
            );


        const registered =
            params.get(
                "registered"
            );


        const message =
            document.getElementById(
                "loginMessage"
            );


        if (!message) {
            return;
        }


        if (
            registered ===
            "client"
        ) {

            showMessage(
                message,
                "Client account created. Please log in.",
                "success"
            );

        }


        if (
            registered ===
            "handyman"
        ) {

            showMessage(
                message,
                "Handyman account created. Please log in.",
                "success"
            );

        }

    }


    /* =====================================================
       INITIALIZE AUTH FORMS
    ===================================================== */

    function initializeAuthForms() {

        const loginForm =
            document.getElementById(
                "loginForm"
            );


        const clientSignupForm =
            document.getElementById(
                "clientSignupForm"
            );


        const handymanSignupForm =
            document.getElementById(
                "handymanSignupForm"
            );


        /* =================================================
           LOGIN
        ================================================= */

        if (
            loginForm &&
            !loginForm.dataset.handyAuthInitialized
        ) {

            loginForm.dataset.handyAuthInitialized =
                "true";


            loginForm.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    login(
                        loginForm
                    );

                }
            );

        }


        /* =================================================
           CLIENT SIGNUP
        ================================================= */

        if (
            clientSignupForm &&
            !clientSignupForm.dataset.handyAuthInitialized
        ) {

            clientSignupForm.dataset.handyAuthInitialized =
                "true";


            clientSignupForm.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    registerClient(
                        clientSignupForm
                    );

                }
            );

        }


        /* =================================================
           HANDYMAN SIGNUP
        ================================================= */

        if (
            handymanSignupForm &&
            !handymanSignupForm.dataset.handyAuthInitialized
        ) {

            handymanSignupForm.dataset.handyAuthInitialized =
                "true";


            handymanSignupForm.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    registerHandyman(
                        handymanSignupForm
                    );

                }
            );

        }


        initializePasswordToggles();

    }


    /* =====================================================
       START
    ===================================================== */

    function startAuth() {

        initializePage();

        initializeAuthForms();

        showRegisteredMessage();

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            startAuth,
            {
                once: true
            }
        );

    } else {

        startAuth();

    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.HandyAuth = {

        getCurrentUser,

        logout,

        registerClient,

        registerHandyman,

        login

    };


})();