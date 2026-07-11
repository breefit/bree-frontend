import { Link } from "react-router-dom";
import {
  Instagram,
  Facebook,
  Twitter,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import DevelopedByStaffArc from "./DevelopedByStaffArc";

const supportLinks = [
  {
    label: "Shipping",
    path: "/support#shipping",
  },
  {
    label: "Returns",
    path: "/support#returns",
  },
  {
    label: "Privacy Policy",
    path: "/support#privacy",
  },
  {
    label: "Terms & Conditions",
    path: "/support#terms",
  },
];

const LOGO_URL =
  "https://res.cloudinary.com/dxfs7qyzm/image/upload/v1779338649/Bree-logo_xgn0eh.png";

const Footer = () => {
  return (
    <footer data-testid="footer" className="bg-bree-text-primary text-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <img
              src={LOGO_URL}
              alt="BREE"
              className="h-28 md:h-32 lg:h-36 w-auto object-contain brightness-0 invert"
            />
            <p className="text-white/70 text-sm leading-relaxed">
              Pure Amla wellness shots for your daily ritual. Rise. Sip. Glow.
            </p>
            <h4 className="font-outfit font-semibold text-lg mb-4">
              Stay Connected
            </h4>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/breefit.in"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                data-testid="social-instagram"
              >
                <Instagram className="w-6 h-6" />
              </a>
              <a
                href="https://www.facebook.com/breefit.in"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                data-testid="social-facebook"
              >
                <Facebook className="w-6 h-6" />
              </a>
              {/* <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                data-testid="social-twitter"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6"
                >
                  <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.637 7.584H.478l8.6-9.83L0 1.153h7.594l5.243 6.932L18.901 1.153zm-1.29 19.494h2.039L6.486 3.24H4.298l13.313 17.407z" />
                </svg>
              </a> */}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-outfit font-semibold text-lg mb-4">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {["Shop", "Benefits", "About", "Contact"].map((item) => (
                <li key={item}>
                  <Link
                    to={`/${item.toLowerCase()}`}
                    className="text-white/70 hover:text-white transition-colors text-sm"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-outfit font-semibold text-lg mb-4">Support</h4>

            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.path}
                    className="text-white/70 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-outfit font-semibold text-lg mb-4">
              Contact Us
            </h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-bree-accent mt-0.5" />
                <span className="text-white/70 text-sm">care@breefit.in</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-bree-accent mt-0.5" />
                <span className="text-white/70 text-sm">+91 88853 15072</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-bree-accent mt-0.5" />
                <span className="text-white/70 text-sm">Hyderabad, India</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/50 text-sm">
              &copy; {new Date().getFullYear()} BREE Wellness. All rights
              reserved.
            </p>

            <DevelopedByStaffArc />

            <div className="flex items-center gap-4">
              <img
                src="https://razorpay.com/assets/razorpay-logo.svg"
                alt="Razorpay"
                className="h-5 opacity-70"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
