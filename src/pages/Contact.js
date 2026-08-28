import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Loader2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";

const CONTACT_INFO = [
  {
    icon: Mail,
    title: "Email",
    value: "care@breefit.in",
    link: "mailto:care@breefit.in",
  },
  {
    icon: Phone,
    title: "Phone",
    value: "+91 88853 15072",
    link: "tel:+918885315072",
  },
  {
    icon: MapPin,
    title: "Address",
    value: "Hyderabad, Telangana, India",
    link: null,
  },
];

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    // WhatsApp Message
    const whatsappMessage = `
*New Contact Message*

👤 Name: ${formData.name}

📧 Email: ${formData.email}

📱 Phone: ${formData.phone}

💬 Message:
${formData.message}
  `;

    // Your WhatsApp Number
    const whatsappNumber = process.env.REACT_APP_WHATSAPP_NUMBER

    // WhatsApp URL
    const whatsappURL = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
      whatsappMessage,
    )}`;

    try {
      await axios.post('/api/contact', formData);
      toast.success("Message sent successfully. Opening WhatsApp...");
    } catch (error) {
      console.error('Backend save failed:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      // Open WhatsApp regardless so the user can continue the conversation
      window.open(whatsappURL, '_blank');
    }

    // Reset Form
    setFormData({
      name: "",
      email: "",
      phone: "",
      message: "",
    });

    setIsLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Contact Us — BREE Wellness</title>

        <meta
          name="description"
          content="Have questions about BREE? Get in touch with our team. We're here to support your wellness journey."
        />
      </Helmet>

      <div className="pt-24 min-h-screen bg-bree-bg">
        {/* Hero Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-3xl mx-auto"
            >
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                Get in Touch
              </span>

              <h1 className="font-outfit text-4xl md:text-5xl tracking-tight leading-tight font-light text-bree-text-primary mt-4 mb-6">
                Contact Us
              </h1>

              <p className="text-bree-text-secondary text-lg">
                Have questions about BREE? We'd love to hear from you. Send us a
                message and we'll respond as soon as possible.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              {/* Contact Form */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm">
                  <h2 className="font-outfit text-2xl font-semibold text-bree-text-primary mb-6">
                    Send us a Message
                  </h2>

                  <form
                    onSubmit={handleSubmit}
                    className="space-y-6"
                    data-testid="contact-form"
                  >
                    {/* Name */}
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-bree-text-primary">
                        Name
                      </Label>

                      <Input
                        id="name"
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        data-testid="contact-name"
                        className="rounded-xl border-bree-border focus:border-bree-primary focus:ring-bree-primary"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-bree-text-primary">
                        Email
                      </Label>

                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        data-testid="contact-email"
                        className="rounded-xl border-bree-border focus:border-bree-primary focus:ring-bree-primary"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-bree-text-primary">
                        Phone
                      </Label>

                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+91 XXXXX XXXXX"
                        data-testid="contact-phone"
                        className="rounded-xl border-bree-border focus:border-bree-primary focus:ring-bree-primary"
                      />
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="message"
                        className="text-bree-text-primary"
                      >
                        Message
                      </Label>

                      <Textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Tell us more..."
                        rows={5}
                        data-testid="contact-message"
                        className="rounded-xl border-bree-border focus:border-bree-primary focus:ring-bree-primary resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={isLoading}
                      data-testid="contact-submit"
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-6 rounded-full font-medium"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Opening WhatsApp...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <FaWhatsapp className="w-6 h-6" />
                          Send Message on WhatsApp
                        </span>
                      )}
                    </Button>
                  </form>
                </div>
              </motion.div>

              {/* Contact Info */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="font-outfit text-2xl font-semibold text-bree-text-primary mb-6">
                    Contact Information
                  </h2>

                  <p className="text-bree-text-secondary mb-8">
                    We're here to help! Reach out to us through any of the
                    following channels.
                  </p>
                </div>

                <div className="space-y-6">
                  {CONTACT_INFO.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-4 p-6 bg-white rounded-2xl"
                    >
                      <div className="w-12 h-12 rounded-xl bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-6 h-6 text-bree-primary" />
                      </div>

                      <div>
                        <h3 className="font-outfit font-semibold text-bree-text-primary">
                          {item.title}
                        </h3>

                        {item.link ? (
                          <a
                            href={item.link}
                            className="text-bree-text-secondary hover:text-bree-primary transition-colors"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="text-bree-text-secondary">
                            {item.value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Contact;
