// LangflowClient class for interacting with the Langflow API
class LangflowClient {
    constructor(baseURL, applicationToken) {
        this.baseURL = baseURL;
        this.applicationToken = applicationToken;
    }
//commennt
    async post(endpoint, body, headers = {"Content-Type": "application/json"}) {
        headers["Authorization"] = `Bearer ${this.applicationToken}`;
        headers["Content-Type"] = "application/json";
        const url = `${this.baseURL}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            const responseMessage = await response.json();
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} - ${JSON.stringify(responseMessage)}`);
            }
            return responseMessage;
        } catch (error) {
            console.error('Request Error:', error.message);
            throw error;
        }
    }

    async initiateSession(flowId, langflowId, inputValue, inputType = 'chat', outputType = 'chat', stream = false, tweaks = {}) {
        const endpoint = `/lf/${langflowId}/api/v1/run/${flowId}?stream=${stream}`;
        return this.post(endpoint, { input_value: inputValue, input_type: inputType, output_type: outputType, tweaks: tweaks });
    }

    async runFlow(flowIdOrName, langflowId, inputValue, inputType = 'chat', outputType = 'chat', tweaks = {}, stream = false) {
        try {
            const initResponse = await this.initiateSession(flowIdOrName, langflowId, inputValue, inputType, outputType, stream, tweaks);
            console.log('Init Response:', initResponse);
            return initResponse;
        } catch (error) {
            console.error('Error running flow:', error);
            throw error;
        }
    }
}

// Initialize LangflowClient with config values
const langflowClient = new LangflowClient(
    config.LANGFLOW_BASE_URL,
    config.LANGFLOW_APPLICATION_TOKEN
);

// Define your flowIdOrName and langflowId from config
const flowIdOrName = config.LANGFLOW_FLOW_ID;
const langflowId = config.LANGFLOW_ID;

// Chat history management
class ChatHistoryManager {
    constructor() {
        this.loadHistory();
    }

    loadHistory() {
        this.currentChat = JSON.parse(localStorage.getItem('currentChat')) || [];
        this.oldChats = JSON.parse(localStorage.getItem('oldChats')) || [];
    }

    saveHistory() {
        localStorage.setItem('currentChat', JSON.stringify(this.currentChat));
        localStorage.setItem('oldChats', JSON.stringify(this.oldChats));
    }

    addMessage(message, sender) {
        const messageObj = {
            text: message,
            sender: sender,
            timestamp: new Date().toISOString()
        };
        this.currentChat.push(messageObj);
        this.saveHistory();
    }

    archiveCurrentChat() {
        if (this.currentChat.length > 0) {
            this.oldChats.push({
                id: Date.now(),
                messages: this.currentChat,
                date: new Date().toISOString()
            });
            this.currentChat = [];
            this.saveHistory();
        }
    }

    clearHistory() {
        this.currentChat = [];
        this.oldChats = [];
        this.saveHistory();
    }

    displayChatHistory() {
        const historyList = document.getElementById('chat-history-list');
        historyList.innerHTML = '';
        
        this.oldChats.slice().reverse().forEach(chat => {
            const firstMessage = chat.messages[0]?.text || 'New Chat';
            const truncatedText = firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '');
            const date = new Date(chat.date).toLocaleDateString();
            
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-history-item';
            chatItem.innerHTML = `
                <span class="chat-title">${truncatedText}</span>
                <span class="chat-date">${date}</span>
            `;
            
            chatItem.addEventListener('click', () => this.loadChat(chat.id));
            historyList.appendChild(chatItem);
        });
    }

    loadChat(chatId) {
        const chat = this.oldChats.find(c => c.id === chatId);
        if (chat) {
            // Archive current chat if it exists
            this.archiveCurrentChat();
            
            // Load selected chat
            this.currentChat = [...chat.messages];
            
            // Remove the selected chat from old chats
            this.oldChats = this.oldChats.filter(c => c.id !== chatId);
            
            // Update storage
            this.saveHistory();
            
            // Update display
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';
            this.currentChat.forEach(msg => {
                displayMessage(msg.text, msg.sender);
            });
            
            // Update sidebar
            this.displayChatHistory();
        }
    }
}

const chatHistory = new ChatHistoryManager();

// DOM elements for the chat interface
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const newChatButton = document.getElementById('new-chat-button');

// Event listeners for sending messages
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Add event listener for new chat button
newChatButton.addEventListener('click', startNewChat);

// Function to send messages to Langflow and display responses
function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    // Display and save the user's message
    displayMessage(message, 'user');
    chatHistory.addMessage(message, 'user');
    
    userInput.value = '';
    userInput.focus();

    // Show typing indicator
    const typingElement = document.createElement('div');
    typingElement.classList.add('message', 'ai-message');
    typingElement.textContent = 'AI is typing...';
    chatMessages.appendChild(typingElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send message to Langflow backend
    langflowClient.runFlow(flowIdOrName, langflowId, message, 'chat', 'chat', {}, false)
        .then((response) => {
            chatMessages.removeChild(typingElement);
            const text = response?.outputs?.[0]?.outputs?.[0]?.outputs?.message?.message?.text;
            if (text) {
                displayMessage(text, 'ai');
                chatHistory.addMessage(text, 'ai');
            } else {
                const errorMessage = 'Sorry, I received an invalid response.';
                displayMessage(errorMessage, 'ai');
                chatHistory.addMessage(errorMessage, 'ai');
            }
            chatHistory.displayChatHistory();
        })
        .catch((error) => {
            console.error('Error:', error);
            chatMessages.removeChild(typingElement);
            const errorMessage = 'Sorry, there was an error processing your request.';
            displayMessage(errorMessage, 'ai');
            chatHistory.addMessage(errorMessage, 'ai');
            chatHistory.displayChatHistory();
        });
}

// Function to display messages in the chat
function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    const timestamp = new Date().toLocaleTimeString();
    messageElement.innerHTML = `<span class="timestamp">${timestamp}</span> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
}

// Load chat history when page loads
window.addEventListener('DOMContentLoaded', () => {
    chatHistory.currentChat.forEach(msg => {
        displayMessage(msg.text, msg.sender);
    });
    chatHistory.displayChatHistory();
});

// Add a function to handle new chat
function startNewChat() {
    chatHistory.archiveCurrentChat();
    chatMessages.innerHTML = '';
    userInput.value = '';
    userInput.focus();
    chatHistory.displayChatHistory();
}
