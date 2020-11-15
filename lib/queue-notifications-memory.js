'use strict';

class QueueNotificationsMemory {
  constructor(args) {
    this.runtime = args.runtime;
    this.logger = args.logger;
  }

  async sendNotification(list, notification, sender) {
    const notifier = this.runtime.notifierList[list];
    notifier.numberCurrentRunning = notifier.numberCurrentRunning + 1;
    try {
      await sender.sendMain(notification);
      notifier.lastEndTime = process.hrtime();
      notifier.numberCurrentRunning = notifier.numberCurrentRunning - 1;
      await this.checkNotificationsSends(list, sender);
    } catch (err) {
      this.logger.log('error', `Notification Sender error: ${err}`);
    }
  }

  async checkNotificationsSends(list, sender) {
    const notifier = this.runtime.notifierList[list];

    if (notifier) {
      //If there are no notifications in process:
      if (notifier.maxConcurrents > notifier.numberCurrentRunning || notifier.maxConcurrents === 0) {
        // If the minimun time interval has past or there was not a previous execution:
        const timeDiff = process.hrtime(notifier.lastEndTime);
        const millisecondsDiff = timeDiff[0] * 1000 + timeDiff[1] / 1000000;

        if (notifier.lastEndTime === [0, 0] || notifier.minInterval <= millisecondsDiff) {
          const notifications = this.runtime.notificationsList[list];
          if (notifications && notifications.length) {
            const notification = notifications.shift();
            await this.sendNotification(list, notification, sender);
          }
        } else {
          // Retry when minInterval expire:
          setTimeout(() => {
            this.checkNotificationsSends(list, sender);
          }, notifier.minInterval - millisecondsDiff);
        }
      }
    }
  }

  async queue(notification, notifToQueue, list) {
    // QUEUE MEMORY;
    // NOTIFICATOR: Create IF NOT EXISTS:
    if (!this.runtime.notifierList.hasOwnProperty(list)) {
      this.runtime.notifierList[list] = {
        notifierId: notification.id,
        minInterval: notifToQueue.minInterval || 0,
        maxConcurrents: notifToQueue.maxConcurrents || 1,
        numberCurrentRunning: 0,
        lastEndTime: [0, 0]
      };
    }
    // NOTIFICATIONS LIST: Create IF NOT EXISTS:
    if (!this.runtime.notificationsList.hasOwnProperty(list)) {
      this.runtime.notificationsList[list] = [];
    }
    this.runtime.notificationsList[list].push(notifToQueue);
    await this.checkNotificationsSends(list, notification);
  }
}
module.exports = QueueNotificationsMemory;
