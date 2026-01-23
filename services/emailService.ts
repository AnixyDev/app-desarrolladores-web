// services/emailService.ts

/**
 * Opens the default mail client to send an email.
 * This is a client-side utility and does not send emails from a server.
 * @param to The recipient's email address.
 * @param subject The subject of the email.
 * @param body The body of the email.
 */
export const sendEmail = (to: string, subject: string, body: string): void => {
    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
};
