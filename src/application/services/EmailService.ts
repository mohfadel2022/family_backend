import nodemailer from 'nodemailer';
import path from 'path';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for 587 (STARTTLS)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false // Helps with some network environments
      }
    });
  }

  async sendPasswordResetEmail(to: string, username: string, resetToken: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"Family System" <${process.env.SMTP_USER}>`,
      to,
      subject: 'إعادة تعيين كلمة المرور - Reset Password',
      html: `
        <div style="direction: rtl; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background-color: #f8fafc; color: #1e293b; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #4f46e5; padding: 30px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; vertical-align: middle; text-align: center;">
                <img src="cid:logo" width="60" height="60" style="display: block; margin: 0 auto 10px auto; border-radius: 12px; border: 2px solid rgba(255,255,255,0.3);" />
                <div style="font-weight: 900; font-size: 20px; line-height: 1;">صندوق العائلة</div>
                <div style="font-size: 10px; font-weight: bold; opacity: 0.8; letter-spacing: 1px; text-transform: uppercase;">Family Charity Fund</div>
              </div>
            </div>
            
            <div style="padding: 40px; text-align: right;">
              <h2 style="color: #1e293b; font-size: 24px; font-weight: 900; margin-bottom: 20px;">طلب إعادة تعيين كلمة المرور</h2>
              <p style="margin-bottom: 15px;">مرحباً <b>${username}</b>،</p>
              <p style="margin-bottom: 25px;">تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في <b>نظام صندوق العائلة</b>. إذا لم تقم بهذا الطلب، يمكنك تجاهل هذا البريد بأمان.</p>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 16px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">إعادة تعيين كلمة المرور</a>
              </div>
              
              <p style="font-size: 13px; color: #64748b; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                ملاحظة: هذا الرابط صالح لمدة <b>ساعة واحدة</b> فقط لأسباب أمنية.
              </p>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
                إذا واجهت مشكلة في الزر، يمكنك نسخ الرابط التالي:<br>
                <span style="color: #4f46e5; font-size: 11px; font-family: monospace; word-break: break-all;">${resetLink}</span>
              </p>
            </div>
            
            <div style="background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: bold;">
              &copy; ${new Date().getFullYear()} نظام صندوق العائلة. جميع الحقوق محفوظة.
            </div>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(process.cwd(), '../frontend/public/logo.png'),
        cid: 'logo' 
      }]
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
