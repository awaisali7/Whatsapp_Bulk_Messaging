class WhatsAppBulkSender {
    constructor() {
        this.isRunning = false;
        this.currentProcess = null;
        this.stats = {
            sent: 0,
            failed: 0,
            total: 0
        };
        
        this.initializeElements();
        this.bindEvents();
        this.checkWhatsAppStatus();
        this.loadSavedData();
    }

    initializeElements() {
        this.elements = {
            phoneNumbers: document.getElementById('phoneNumbers'),
            message: document.getElementById('message'),
            delay: document.getElementById('delay'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            status: document.getElementById('status'),
            progress: document.querySelector('.progress'),
            progressBar: document.querySelector('.progress-bar'),
            stats: document.querySelector('.stats'),
            sentCount: document.getElementById('sentCount'),
            failedCount: document.getElementById('failedCount'),
            remainingCount: document.getElementById('remainingCount')
        };
    }

    bindEvents() {
        this.elements.startBtn.addEventListener('click', () => this.startProcess());
        this.elements.stopBtn.addEventListener('click', () => this.stopProcess());
        
        // Auto-save functionality
        this.elements.phoneNumbers.addEventListener('input', () => this.saveData());
        this.elements.message.addEventListener('input', () => this.saveData());
        this.elements.delay.addEventListener('input', () => this.saveData());
        
        // Listen for background script messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message);
        });
        
        // Add validation hints
        this.elements.phoneNumbers.addEventListener('blur', () => this.validatePhoneNumbers());
        this.elements.message.addEventListener('blur', () => this.validateMessage());
    }

    async checkWhatsAppStatus() {
        try {
            const tabs = await chrome.tabs.query({url: 'https://web.whatsapp.com/*'});
            if (tabs.length === 0) {
                this.showStatus('⚠️ Please open WhatsApp Web first and ensure you are logged in', 'error');
                this.elements.startBtn.disabled = true;
                this.elements.startBtn.textContent = 'Open WhatsApp Web First';
            } else {
                // Check if WhatsApp is actually loaded and logged in
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        function: () => {
                            const hasQR = document.querySelector('[data-testid="qrcode"]');
                            const hasChat = document.querySelector('[data-testid="chat-list"]') || 
                                           document.querySelector('div[role="application"]');
                            const isLoading = document.querySelector('[data-testid="startup"]');
                            
                            return {
                                hasQR: !!hasQR,
                                hasChat: !!hasChat,
                                isLoading: !!isLoading,
                                url: window.location.href
                            };
                        }
                    });
                    
                    const whatsappState = results[0].result;
                    
                    if (whatsappState.hasQR) {
                        this.showStatus('📱 Please scan QR code in WhatsApp Web to login', 'error');
                        this.elements.startBtn.disabled = true;
                        this.elements.startBtn.textContent = 'Login to WhatsApp First';
                    } else if (whatsappState.isLoading) {
                        this.showStatus('⏳ WhatsApp is loading, please wait...', 'info');
                        this.elements.startBtn.disabled = true;
                        setTimeout(() => this.checkWhatsAppStatus(), 3000);
                    } else if (whatsappState.hasChat) {
                        this.showStatus('✅ WhatsApp Web is ready!', 'success');
                        this.elements.startBtn.disabled = false;
                        this.elements.startBtn.textContent = 'Start Sending Messages';
                    } else {
                        this.showStatus('❓ WhatsApp Web status unclear, you can try to proceed', 'info');
                        this.elements.startBtn.disabled = false;
                        this.elements.startBtn.textContent = 'Start Sending Messages';
                    }
                } catch (scriptError) {
                    console.log('Could not check WhatsApp state:', scriptError);
                    this.showStatus('✅ WhatsApp Web detected, ready to proceed', 'success');
                    this.elements.startBtn.disabled = false;
                    this.elements.startBtn.textContent = 'Start Sending Messages';
                }
            }
        } catch (error) {
            console.error('Error checking WhatsApp status:', error);
            this.showStatus('Error checking WhatsApp status, you can try to proceed', 'error');
        }
    }

    validatePhoneNumbers() {
        const phoneNumbers = this.getPhoneNumbers();
        if (phoneNumbers.length === 0 && this.elements.phoneNumbers.value.trim()) {
            this.showStatus('⚠️ Please enter valid phone numbers with country codes (e.g., +1234567890)', 'error');
            return false;
        } else if (phoneNumbers.length > 0) {
            this.showStatus(`✅ ${phoneNumbers.length} valid phone numbers detected`, 'success');
            return true;
        }
        return true;
    }

    validateMessage() {
        const message = this.elements.message.value.trim();
        if (message.length === 0) {
            this.showStatus('⚠️ Please enter a message to send', 'error');
            return false;
        } else if (message.length > 4000) {
            this.showStatus('⚠️ Message is too long (max 4000 characters)', 'error');
            return false;
        } else {
            this.showStatus(`✅ Message ready (${message.length} characters)`, 'success');
            return true;
        }
    }

    validateInputs() {
        const phoneNumbers = this.getPhoneNumbers();
        const message = this.elements.message.value.trim();
        const delay = parseInt(this.elements.delay.value);

        if (phoneNumbers.length === 0) {
            throw new Error('Please enter at least one valid phone number with country code (e.g., +1234567890)');
        }

        if (phoneNumbers.length > 100) {
            throw new Error('Maximum 100 phone numbers allowed per batch for safety');
        }

        if (!message) {
            throw new Error('Please enter a message to send');
        }

        if (message.length > 4000) {
            throw new Error('Message is too long (maximum 4000 characters)');
        }

        if (delay < 5) {
            throw new Error('Delay must be at least 5 seconds to avoid being blocked by WhatsApp');
        }

        if (delay > 300) {
            throw new Error('Delay cannot exceed 5 minutes (300 seconds)');
        }

        return { phoneNumbers, message, delay: delay * 1000 };
    }

    getPhoneNumbers() {
        const input = this.elements.phoneNumbers.value.trim();
        if (!input) return [];

        // Split by newlines or commas
        const numbers = input.split(/[\n,]/)
            .map(num => num.trim())
            .filter(num => num.length > 0)
            .map(num => {
                // Clean the number
                let cleaned = num.replace(/[^\d+]/g, '');
                
                // Ensure number starts with +
                if (!cleaned.startsWith('+')) {
                    cleaned = '+' + cleaned;
                }
                
                return cleaned;
            })
            .filter(num => {
                // Validate phone number format
                const digits = num.replace(/^\+/, '');
                return digits.length >= 7 && digits.length <= 15; // International standard
            });

        return [...new Set(numbers)]; // Remove duplicates
    }

    async startProcess() {
        try {
            const { phoneNumbers, message, delay } = this.validateInputs();
            
            // Final confirmation for large batches
            if (phoneNumbers.length > 10) {
                const confirmed = confirm(`You are about to send messages to ${phoneNumbers.length} contacts. This will take approximately ${Math.ceil((phoneNumbers.length * delay) / 60000)} minutes. Continue?`);
                if (!confirmed) {
                    return;
                }
            }
            
            this.isRunning = true;
            this.stats = { sent: 0, failed: 0, total: phoneNumbers.length };
            
            this.updateUI('running');
            this.showStatus(`🚀 Starting to send messages to ${phoneNumbers.length} contacts...`, 'info');
            
            // Save current data
            this.saveData();
            
            // Send to background script
            const response = await chrome.runtime.sendMessage({
                type: 'START_BULK_SEND',
                data: { phoneNumbers, message, delay }
            });

            if (response && response.success) {
                this.showStatus('✅ Process started successfully! Please keep this popup open.', 'success');
            } else {
                throw new Error(response?.error || 'Failed to start process');
            }

        } catch (error) {
            this.showStatus(`❌ ${error.message}`, 'error');
            this.stopProcess();
        }
    }

    stopProcess() {
        this.isRunning = false;
        chrome.runtime.sendMessage({ type: 'STOP_BULK_SEND' });
        this.updateUI('stopped');
        this.showStatus('⏹️ Process stopped by user', 'info');
    }

    handleBackgroundMessage(message) {
        switch (message.type) {
            case 'SEND_PROGRESS':
                this.updateProgress(message.data);
                break;
            case 'SEND_COMPLETE':
                this.onProcessComplete(message.data);
                break;
            case 'SEND_ERROR':
                this.showStatus(`❌ Error: ${message.data.error}`, 'error');
                break;
        }
    }

    updateProgress(data) {
        this.stats.sent = data.sent;
        this.stats.failed = data.failed;
        
        const completed = this.stats.sent + this.stats.failed;
        const progress = (completed / this.stats.total) * 100;
        
        this.elements.progressBar.style.width = Math.round(progress) + '%';
        this.elements.sentCount.textContent = this.stats.sent;
        this.elements.failedCount.textContent = this.stats.failed;
        this.elements.remainingCount.textContent = this.stats.total - completed;
        
        // Show current number being processed
        const currentNumber = data.currentNumber ? 
            ` (${data.currentNumber.substring(0, 10)}...)` : '';
        
        const estimatedTimeLeft = Math.ceil(((this.stats.total - completed) * 
            parseInt(this.elements.delay.value)) / 60);
        
        this.showStatus(
            `📤 Processing: ${data.current}/${this.stats.total}${currentNumber}\n` +
            `✅ Sent: ${this.stats.sent} | ❌ Failed: ${this.stats.failed}\n` +
            `⏱️ Est. time left: ${estimatedTimeLeft} min`,
            'info'
        );
        
        // Update window title to show progress
        document.title = `(${Math.round(progress)}%) WhatsApp Bulk Sender`;
        
        // Keep popup alive
        console.log(`Progress: ${completed}/${this.stats.total} messages processed`);
    }

    onProcessComplete(data) {
        this.isRunning = false;
        this.updateUI('stopped');
        
        const { sent, failed, total } = data;
        const successRate = Math.round((sent / total) * 100);
        
        // Reset window title
        document.title = 'WhatsApp Bulk Sender';
        
        let statusMessage = `🎉 Process Complete!\n`;
        statusMessage += `✅ Successfully sent: ${sent}\n`;
        statusMessage += `❌ Failed: ${failed}\n`;
        statusMessage += `📊 Success rate: ${successRate}%`;
        
        if (failed > 0) {
            statusMessage += `\n\n💡 Tips for failed messages:\n`;
            statusMessage += `• Check if numbers are valid\n`;
            statusMessage += `• Some numbers might have blocked you\n`;
            statusMessage += `• Try increasing delay between messages`;
        }
        
        this.showStatus(statusMessage, sent > 0 ? 'success' : 'error');
        
        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('WhatsApp Bulk Sender Complete', {
                body: `Sent: ${sent}, Failed: ${failed} (${successRate}% success rate)`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2325D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.485"/></svg>',
                tag: 'whatsapp-bulk-complete'
            });
        }
        
        // Auto-clear sensitive data after completion (optional)
        if (confirm('Process completed! Would you like to clear the phone numbers for privacy?')) {
            this.elements.phoneNumbers.value = '';
            this.saveData();
        }
    }

    updateUI(state) {
        switch (state) {
            case 'running':
                this.elements.startBtn.style.display = 'none';
                this.elements.stopBtn.style.display = 'block';
                this.elements.progress.style.display = 'block';
                this.elements.stats.style.display = 'flex';
                this.elements.phoneNumbers.disabled = true;
                this.elements.message.disabled = true;
                this.elements.delay.disabled = true;
                break;
            case 'stopped':
                this.elements.startBtn.style.display = 'block';
                this.elements.stopBtn.style.display = 'none';
                this.elements.phoneNumbers.disabled = false;
                this.elements.message.disabled = false;
                this.elements.delay.disabled = false;
                break;
        }
    }

    showStatus(message, type) {
        this.elements.status.innerHTML = message.replace(/\n/g, '<br>');
        this.elements.status.className = `status ${type}`;
        this.elements.status.style.display = 'block';
        
        // Auto hide success messages after 5 seconds (except during processing)
        if (type === 'success' && !this.isRunning) {
            setTimeout(() => {
                if (this.elements.status.classList.contains('success') && !this.isRunning) {
                    this.elements.status.style.display = 'none';
                }
            }, 5000);
        }
    }

    // Save and load data for user convenience
    saveData() {
        try {
            const data = {
                phoneNumbers: this.elements.phoneNumbers.value,
                message: this.elements.message.value,
                delay: this.elements.delay.value
            };
            localStorage.setItem('whatsapp-bulk-sender-data', JSON.stringify(data));
        } catch (error) {
            console.log('Could not save data:', error);
        }
    }

    loadSavedData() {
        try {
            const saved = localStorage.getItem('whatsapp-bulk-sender-data');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.phoneNumbers) this.elements.phoneNumbers.value = data.phoneNumbers;
                if (data.message) this.elements.message.value = data.message;
                if (data.delay) this.elements.delay.value = data.delay;
            }
        } catch (error) {
            console.log('Could not load saved data:', error);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppBulkSender();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});