// This script runs in the main world context for direct access to WhatsApp's objects
(function() {
    'use strict';
    
    console.log('WhatsApp Injected Script Loaded');
    
    // Function to find React components and trigger their methods
    function findReactComponent(element) {
        for (const key in element) {
            if (key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber')) {
                return element[key];
            }
        }
        return null;
    }
    
    // Enhanced message sending function that works with React
    function sendMessageDirect(message) {
        try {
            // Find the message input
            const messageInput = document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                               document.querySelector('div[contenteditable="true"]') ||
                               document.querySelector('[role="textbox"]');
            
            if (!messageInput) {
                console.log('Message input not found');
                return false;
            }
            
            // Focus the input
            messageInput.focus();
            
            // Try to access React instance and trigger change
            const reactComponent = findReactComponent(messageInput);
            if (reactComponent) {
                try {
                    // Clear existing content
                    messageInput.textContent = '';
                    messageInput.innerHTML = '';
                    
                    // Set new content
                    messageInput.textContent = message;
                    
                    // Trigger React's onChange if available
                    const props = reactComponent.memoizedProps || reactComponent.pendingProps;
                    if (props && props.onChange) {
                        props.onChange({
                            target: messageInput,
                            currentTarget: messageInput
                        });
                    }
                    
                    // Trigger React's onInput if available
                    if (props && props.onInput) {
                        props.onInput({
                            target: messageInput,
                            currentTarget: messageInput
                        });
                    }
                    
                } catch (reactError) {
                    console.log('React method failed:', reactError);
                }
            }
            
            // Fallback: standard DOM events
            messageInput.textContent = message;
            
            // Comprehensive event triggering
            const events = [
                'focus', 'input', 'change', 'keyup', 'keydown', 'keypress'
            ];
            
            events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                messageInput.dispatchEvent(event);
            });
            
            // Wait a moment then try to send
            setTimeout(() => {
                // Try to find and click send button
                const sendButton = document.querySelector('button[data-tab="11"]') ||
                                 document.querySelector('span[data-icon="send"]')?.closest('button') ||
                                 document.querySelector('button[aria-label*="Send"]');
                
                if (sendButton) {
                    sendButton.click();
                    console.log('Send button clicked');
                } else {
                    // Fallback: Enter key
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    messageInput.dispatchEvent(enterEvent);
                    console.log('Enter key sent');
                }
            }, 500);
            
            return true;
            
        } catch (error) {
            console.error('Error in sendMessageDirect:', error);
            return false;
        }
    }
    
    // Expose function to content script
    window.WhatsAppDirectSend = sendMessageDirect;
    
    // Listen for messages from content script
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'SEND_MESSAGE_DIRECT') {
            const success = sendMessageDirect(event.data.message);
            window.postMessage({
                type: 'SEND_MESSAGE_RESULT',
                success: success,
                requestId: event.data.requestId
            }, '*');
        }
    });
    
})();