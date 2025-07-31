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
        
        // Listen for background script messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleBackgroundMessage(message);
        });
    }

    async checkWhatsAppStatus() {
        try {
            const tabs = await chrome.tabs.query({url: 'https://web.whatsapp.com/*'});
            if (tabs.length === 0) {
                this.showStatus('Please open WhatsApp Web first', 'error');
                this.elements.startBtn.disabled = true;
            } else {
                this.showStatus('Ready to send messages', 'success');
                this.elements.startBtn.disabled = false;
            }
        } catch (error) {
            this.showStatus('Error checking WhatsApp status', 'error');
        }
    }

    validateInputs() {
        const phoneNumbers = this.getPhoneNumbers();
        const message = this.elements.message.value.trim();
        const delay = parseInt(this.elements.delay.value);

        if (phoneNumbers.length === 0) {
            throw new Error('Please enter at least one valid phone number');
        }

        if (!message) {
            throw new Error('Please enter a message');
        }

        if (delay < 5) {
            throw new Error('Delay must be at least 5 seconds');
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
                // Ensure number starts with +
                if (!num.startsWith('+')) {
                    num = '+' + num.replace(/^\+?/, '');
                }
                // Remove any non-digit characters except +
                return num.replace(/[^\d+]/g, '');
            })
            .filter(num => num.length >= 8); // Minimum valid phone number length

        return [...new Set(numbers)]; // Remove duplicates
    }

    async startProcess() {
        try {
            const { phoneNumbers, message, delay } = this.validateInputs();
            
            this.isRunning = true;
            this.stats = { sent: 0, failed: 0, total: phoneNumbers.length };
            
            this.updateUI('running');
            this.showStatus(`Starting to send to ${phoneNumbers.length} contacts...`, 'info');
            
            // Send to background script
            const response = await chrome.runtime.sendMessage({
                type: 'START_BULK_SEND',
                data: { phoneNumbers, message, delay }
            });

            if (response && response.success) {
                this.showStatus('Process started successfully', 'success');
            } else {
                throw new Error(response?.error || 'Failed to start process');
            }

        } catch (error) {
            this.showStatus(error.message, 'error');
            this.stopProcess();
        }
    }

    stopProcess() {
        this.isRunning = false;
        chrome.runtime.sendMessage({ type: 'STOP_BULK_SEND' });
        this.updateUI('stopped');
        this.showStatus('Process stopped', 'info');
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
                this.showStatus(`Error: ${message.data.error}`, 'error');
                break;
        }
    }

    updateProgress(data) {
        this.stats.sent = data.sent;
        this.stats.failed = data.failed;
        
        const completed = this.stats.sent + this.stats.failed;
        const progress = (completed / this.stats.total) * 100;
        
        this.elements.progressBar.style.width = progress + '%';
        this.elements.sentCount.textContent = this.stats.sent;
        this.elements.failedCount.textContent = this.stats.failed;
        this.elements.remainingCount.textContent = this.stats.total - completed;
        
        this.showStatus(
            `Progress: ${completed}/${this.stats.total} (${Math.round(progress)}%)`,
            'info'
        );
    }

    onProcessComplete(data) {
        this.isRunning = false;
        this.updateUI('stopped');
        
        const { sent, failed, total } = data;
        this.showStatus(
            `Complete! Sent: ${sent}, Failed: ${failed}, Total: ${total}`,
            sent > 0 ? 'success' : 'error'
        );
        
        // Show notification
        if (Notification.permission === 'granted') {
            new Notification('WhatsApp Bulk Sender', {
                body: `Process complete. Sent: ${sent}, Failed: ${failed}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2325D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.485"/></svg>'
            });
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
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        this.elements.status.style.display = 'block';
        
        // Auto hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (this.elements.status.classList.contains('success')) {
                    this.elements.status.style.display = 'none';
                }
            }, 3000);
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