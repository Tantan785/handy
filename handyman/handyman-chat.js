import {
    auth,
    db
} from "../firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   ELEMENTS
========================================================= */

const conversationList =
    document.getElementById("conversationList");

const messagesContainer =
    document.getElementById("messages");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const chatAvatar =
    document.getElementById("chatAvatar");

const chatName =
    document.getElementById("chatName");

const chatService =
    document.getElementById("chatService");


let currentUser = null;
let selectedConversation = null;

let conversations = [];

let unsubscribeConversations = null;
let unsubscribeMessages = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function getInitial(name) {

    return (
        String(name || "C")
            .trim()
            .charAt(0)
            .toUpperCase() || "C"
    );

}


function formatTime(timestamp) {

    if (!timestamp) {
        return "";
    }

    try {

        const date =
            timestamp.toDate
                ? timestamp.toDate()
                : new Date(timestamp);

        return date.toLocaleTimeString(
            [],
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );

    } catch {
        return "";
    }

}


function getConversationClientId(
    conversation
) {

    if (
        conversation.clientId ===
        currentUser.uid
    ) {
        return conversation.handymanId;
    }

    return conversation.clientId;
}


/* =========================================================
   LOAD CONVERSATIONS
========================================================= */

function loadConversations() {

    if (!currentUser) {
        return;
    }


    const conversationsQuery =
        query(
            collection(
                db,
                "conversations"
            ),
            where(
                "handymanId",
                "==",
                currentUser.uid
            )
        );


    unsubscribeConversations =
        onSnapshot(
            conversationsQuery,
            async snapshot => {

                conversations =
                    snapshot.docs.map(
                        item => ({
                            id: item.id,
                            ...item.data()
                        })
                    );


                conversations.sort(
                    (a, b) => {

                        const first =
                            a.updatedAt?.seconds ||
                            a.createdAt?.seconds ||
                            0;

                        const second =
                            b.updatedAt?.seconds ||
                            b.createdAt?.seconds ||
                            0;

                        return second - first;

                    }
                );


                await renderConversations();

            },
            error => {

                console.error(
                    "HANDY CHAT CONVERSATIONS ERROR:",
                    error
                );


                conversationList.innerHTML = `
                    <div class="empty-conversations">
                        Unable to load conversations.
                    </div>
                `;

            }
        );

}


/* =========================================================
   RENDER CONVERSATIONS
========================================================= */

async function renderConversations() {

    if (!conversations.length) {

        conversationList.innerHTML = `
            <div class="empty-conversations">
                No client conversations yet.
            </div>
        `;

        return;
    }


    const rendered =
        await Promise.all(
            conversations.map(
                async conversation => {

                    const clientId =
                        conversation.clientId;


                    let clientName =
                        conversation.clientName ||
                        "Client";


                    let clientService =
                        conversation.serviceName ||
                        "Handy service";

                    try {

                        const clientSnapshot =
                            await getDoc(
                                doc(
                                    db,
                                    "users",
                                    clientId
                                )
                            );


                        if (
                            clientSnapshot.exists()
                        ) {

                            const clientData =
                                clientSnapshot.data();


                            clientName =
                                clientData.name ||
                                clientName;

                        }

                    } catch (error) {

                        console.error(
                            "CLIENT PROFILE ERROR:",
                            error
                        );

                    }


                    const active =
                        selectedConversation?.id ===
                        conversation.id
                            ? "active"
                            : "";


                    const preview =
                        conversation.lastMessage ||
                        "No messages yet";


                    const time =
                        formatTime(
                            conversation.updatedAt ||
                            conversation.createdAt
                        );


                    return `
                        <button
                            type="button"
                            class="conversation ${active}"
                            data-conversation-id="${escapeHTML(conversation.id)}"
                        >

                            <div class="conversation-avatar">
                                ${escapeHTML(getInitial(clientName))}
                            </div>

                            <div class="conversation-content">

                                <span class="conversation-name">
                                    ${escapeHTML(clientName)}
                                </span>

                                <span class="conversation-preview">
                                    ${escapeHTML(preview)}
                                </span>

                            </div>

                            <span class="conversation-time">
                                ${escapeHTML(time)}
                            </span>

                        </button>
                    `;

                }
            )
        );


    conversationList.innerHTML =
        rendered.join("");


    conversationList
        .querySelectorAll(
            "[data-conversation-id]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        button.dataset.conversationId;

                    const conversation =
                        conversations.find(
                            item =>
                                item.id === id
                        );


                    if (conversation) {
                        openConversation(
                            conversation
                        );
                    }

                }
            );

        });

}


/* =========================================================
   OPEN CONVERSATION
========================================================= */

async function openConversation(
    conversation
) {

    selectedConversation =
        conversation;


    chatName.textContent =
        conversation.clientName ||
        "Client";


    chatService.textContent =
        conversation.serviceName ||
        conversation.service ||
        "Client conversation";


    chatAvatar.textContent =
        getInitial(
            conversation.clientName ||
            "Client"
        );


    messageInput.disabled =
        false;

    sendButton.disabled =
        false;


    await renderConversations();


    loadMessages(
        conversation.id
    );

}


/* =========================================================
   LOAD MESSAGES REALTIME
========================================================= */

function loadMessages(
    conversationId
) {

    if (unsubscribeMessages) {

        unsubscribeMessages();

        unsubscribeMessages =
            null;

    }


    messagesContainer.innerHTML = `
        <div class="chat-empty">
            Loading messages...
        </div>
    `;


    const messagesQuery =
        query(
            collection(
                db,
                "conversations",
                conversationId,
                "messages"
            ),
            orderBy(
                "createdAt",
                "asc"
            )
        );


    unsubscribeMessages =
        onSnapshot(
            messagesQuery,
            snapshot => {

                if (
                    snapshot.empty
                ) {

                    messagesContainer.innerHTML = `
                        <div class="chat-empty">
                            No messages yet. Start the conversation.
                        </div>
                    `;

                    return;
                }


                messagesContainer.innerHTML =
                    snapshot.docs
                        .map(
                            item => {

                                const message =
                                    item.data();


                                const mine =
                                    message.senderId ===
                                    currentUser.uid;


                                return `
                                    <div
                                        class="message-row ${mine ? "mine" : "theirs"}"
                                    >

                                        <div class="message-bubble">

                                            ${escapeHTML(message.text)}

                                            <span class="message-time">
                                                ${escapeHTML(
                                                    formatTime(
                                                        message.createdAt
                                                    )
                                                )}
                                            </span>

                                        </div>

                                    </div>
                                `;

                            }
                        )
                        .join("");


                messagesContainer.scrollTop =
                    messagesContainer.scrollHeight;

            },
            error => {

                console.error(
                    "HANDY CHAT MESSAGES ERROR:",
                    error
                );


                messagesContainer.innerHTML = `
                    <div class="chat-empty">
                        Unable to load messages.
                    </div>
                `;

            }
        );

}


/* =========================================================
   SEND MESSAGE
========================================================= */

messageForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        if (
            !currentUser ||
            !selectedConversation
        ) {
            return;
        }


        const text =
            messageInput.value.trim();


        if (!text) {
            return;
        }


        sendButton.disabled =
            true;


        try {

            const conversationId =
                selectedConversation.id;


            const conversationRef =
                doc(
                    db,
                    "conversations",
                    conversationId
                );


            const messageRef =
                collection(
                    db,
                    "conversations",
                    conversationId,
                    "messages"
                );


            await addDoc(
                messageRef,
                {
                    senderId:
                        currentUser.uid,

                    senderRole:
                        "handyman",

                    text:
                        text,

                    createdAt:
                        serverTimestamp()
                }
            );


            await updateDoc(
                conversationRef,
                {
                    lastMessage:
                        text,

                    lastSenderId:
                        currentUser.uid,

                    updatedAt:
                        serverTimestamp()
                }
            );


            messageInput.value = "";


        } catch (error) {

            console.error(
                "HANDY CHAT SEND ERROR:",
                error
            );


            alert(
                error.code === "permission-denied"
                    ? "Firebase blocked this message. Check your Firestore rules."
                    : "Unable to send message."
            );

        } finally {

            sendButton.disabled =
                false;

            messageInput.focus();

        }

    }
);


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;
        }


        currentUser =
            user;


        try {

            const userSnapshot =
                await getDoc(
                    doc(
                        db,
                        "users",
                        user.uid
                    )
                );


            if (
                !userSnapshot.exists()
            ) {

                await auth.signOut();

                window.location.href =
                    "../login.html";

                return;
            }


            const userData =
                userSnapshot.data();


            if (
                userData.role !==
                "handyman"
            ) {

                await auth.signOut();

                window.location.href =
                    "../login.html";

                return;
            }


            loadConversations();


        } catch (error) {

            console.error(
                "HANDY CHAT AUTH ERROR:",
                error
            );

            conversationList.innerHTML = `
                <div class="empty-conversations">
                    Unable to load your account.
                </div>
            `;

        }

    }
);