import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import ShippingPolicy from "../components/support/ShippingPolicy";
import ReturnsPolicy from "../components/support/ReturnsPolicy";
import PrivacyPolicy from "../components/support/PrivacyPolicy";
import TermsConditions from "../components/support/TermsConditions";
import SupportNavigation from "../components/support/SupportNavigation";

export default function Support() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    const id = location.hash.substring(1);
    const element = document.getElementById(id);

    if (element) {
      setTimeout(() => {
        const headerOffset = 100; // Adjust if your navbar height is different
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [location]);

  return (
    <main className="bg-[#F8F8F4]">
      <SupportNavigation />
      <ShippingPolicy />
      <ReturnsPolicy />
      <PrivacyPolicy />
      <TermsConditions />
    </main>
  );
}
