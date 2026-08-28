import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

// Route this form lives on (see App.js) — used to send the user straight
// back here after logging in, without auto-submitting on their behalf.
const BULK_ORDER_ROUTE = "/bulk";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/; // 10-digit Indian mobile number

// Single source of truth for the minimum bulk order quantity. Drives the marketing
// copy (stat card + MOQ section) as well as the Estimated Quantity field's
// validation, input constraints, and helper text.
const MIN_ORDER_QUANTITY = 100;

// CHANGE (Req #2): maximum characters allowed in the Requirements textarea.
const REQUIREMENTS_MAX_LENGTH = 1000;

// CHANGE (Req #6): field-level max lengths (in addition to Requirements above).
const FIELD_MAX_LENGTHS = {
  companyName: 100,
  contactPerson: 60,
  location: 100,
  requirements: REQUIREMENTS_MAX_LENGTH,
};

const SUCCESS_MESSAGE =
  "Bulk enquiry submitted successfully. Our team will review your request and contact you shortly with a customized quotation.";

// CHANGE (Req #5): generic fallback message text updated to match the new
// network/backend/generic error-handling requirement.
const GENERIC_ERROR_MESSAGE =
  "Unable to submit your enquiry. Please try again later.";

// CHANGE (Req #5): dedicated message for connectivity failures (no response received).
const NETWORK_ERROR_MESSAGE =
  "Network error. Please check your internet connection.";

// CHANGE (Req #8): business contact details for the "Need Immediate Assistance?" card.
// ASSUMPTION: this project has no shared constants module visible in this file, so
// values are declared locally. If a constants file (e.g. `@/lib/constants`) already
// holds these, replace this block with an import from there instead of duplicating.
const CONTACT_PHONE_DISPLAY = "+91 88853 15072";
const CONTACT_PHONE_DIAL = "+918885315072";
const CONTACT_WHATSAPP_DIGITS = "918885315072";
const CONTACT_EMAIL = "care@breefit.in"; 

const NOTE_ITEMS = [
  "This form is only for quotation requests.",
  "Submitting this form does not confirm your order.",
  "Our team will review your enquiry.",
  "A customized quotation will be shared after review.",
  "Payment instructions will be shared only after quotation approval.",
  "Production begins only after successful payment confirmation.",
];

// CHANGE (Req #9): added a decorative `icon` per step (presentation only — step
// numbers, titles, descriptions, and sequence are all unchanged).
const ORDER_STEPS = [
  {
    step: 1,
    icon: "📝",
    title: "Submit Bulk Enquiry",
    description: "Share your bulk order requirements with us.",
  },
  {
    step: 2,
    icon: "🔍",
    title: "Request Review",
    description: "Our team reviews your enquiry.",
  },
  {
    step: 3,
    icon: "💬",
    title: "Team Clarification",
    description: "We reach out if additional information is required.",
  },
  {
    step: 4,
    icon: "🧾",
    title: "Quotation Preparation",
    description: "A customized quotation is prepared for you.",
  },
  {
    step: 5,
    icon: "📤",
    title: "Quotation Shared",
    description: "Your quotation is shared for review.",
  },
  {
    step: 6,
    icon: "👍",
    title: "Customer Approval",
    description: "You review and approve the quotation.",
  },
  {
    step: 7,
    icon: "🔗",
    title: "Payment Link Shared",
    description: "Payment instructions are shared with you.",
  },
  {
    step: 8,
    icon: "✅",
    title: "Payment Verified",
    description: "We confirm your payment on our end.",
  },
  {
    step: 9,
    icon: "🎉",
    title: "Bulk Order Confirmed",
    description: "Your bulk order is officially confirmed.",
  },
  {
    step: 10,
    icon: "🏭",
    title: "Production",
    description: "Your order moves into production.",
  },
  {
    step: 11,
    icon: "🚚",
    title: "Dispatch",
    description: "Your order is packed and dispatched.",
  },
  {
    step: 12,
    icon: "🏠",
    title: "Delivery",
    description: "Your order is delivered to you.",
  },
];

const INITIAL_FORM_STATE = {
  companyName: "",
  contactPerson: "",
  email: "",
  mobileNumber: "",
  location: "",
  quantity: "",
  requirements: "",
};

// CHANGE (Req #4): visual/tab order of fields, used to find the first invalid
// field so we can scroll to it and focus it after a failed validation.
const FIELD_ORDER = [
  "companyName",
  "contactPerson",
  "email",
  "mobileNumber",
  "location",
  "quantity",
  "requirements",
];

// CHANGE (Req #4 - mobile UX): formats a raw 10-digit string as "98765 43210"
// for display, while state/payload continue to store the raw digits only.
const formatMobileForDisplay = (digits) => {
  if (!digits) return "";
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
};

export default function BulkBookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});

  // CHANGE (Req #1 - success card): whether the success confirmation card is showing
  // in place of the form, and the booking number if the backend ever returns one.
  const [submitted, setSubmitted] = useState(false);
  const [bookingNumber, setBookingNumber] = useState(null);

  // CHANGE (Req #4): refs for every field, populated via callback refs on each input,
  // so we can scroll to and focus whichever field fails validation first.
  const fieldRefs = useRef({});

  // CHANGE (Req #10): defensive flag so a stray/duplicate submit call after a
  // successful submission can never fire a second POST. The `submitted` state
  // already unmounts the form (the primary guard); this ref is a backstop.
  const hasSubmittedRef = useRef(false);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    let nextValue = value;

    // CHANGE (Req #2): strip anything non-numeric and cap Mobile Number to 10 digits
    // as the user types (blocks alphabets, symbols, and extra digits).
    if (name === "mobileNumber") {
      nextValue = value.replace(/\D/g, "").slice(0, 10);
    }

    // CHANGE (Req #3): strip anything non-numeric from Quantity so only positive
    // integers can ever land in state (blocks decimals, "e", "+", "-").
    if (name === "quantity") {
      nextValue = value.replace(/\D/g, "");
    }

    // CHANGE (Req #5 - auto clean): collapse consecutive spaces as the user types.
    // A single trailing space while typing is left alone (final trim happens on
    // blur/submit) so users can still type multi-word values normally.
    if (["companyName", "contactPerson", "location"].includes(name)) {
      nextValue = value.replace(/ {2,}/g, " ");
    }

    // CHANGE (Req #6): hard cap on field length, mirroring each input's maxLength.
    if (FIELD_MAX_LENGTHS[name]) {
      nextValue = nextValue.slice(0, FIELD_MAX_LENGTHS[name]);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));

    // Clear the field-level error as soon as the user starts correcting it
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  // CHANGE (Req #5 - auto clean): trims leading/trailing spaces on blur for the
  // free-text fields, without touching validation logic.
  const handleBlurTrim = useCallback((e) => {
    const { name, value } = e.target;
    if (!["companyName", "contactPerson", "location"].includes(name)) return;
    const trimmed = value.replace(/ {2,}/g, " ").trim();
    if (trimmed === value) return;
    setFormData((prev) => ({ ...prev, [name]: trimmed }));
  }, []);

  // CHANGE (Req #3): blocks keystrokes for characters that are technically valid in a
  // native number input ("e", "+", "-", ".") but would otherwise allow decimals/negatives.
  const handleQuantityKeyDown = useCallback((e) => {
    if (["e", "E", "+", "-", "."].includes(e.key)) {
      e.preventDefault();
    }
  }, []);

  const validate = useCallback((data) => {
    const nextErrors = {};

    const companyName = data.companyName.trim();
    const contactPerson = data.contactPerson.trim();
    const email = data.email.trim();
    const mobileNumber = data.mobileNumber.trim();
    const location = data.location.trim();
    const requirements = data.requirements.trim();

    if (!companyName) {
      nextErrors.companyName = "Company / organization name is required.";
    } else if (companyName.length < 3) {
      nextErrors.companyName = "Company name must be at least 3 characters.";
    }

    if (!contactPerson) {
      nextErrors.contactPerson = "Contact person is required.";
    } else if (contactPerson.length < 3) {
      nextErrors.contactPerson =
        "Contact person name must be at least 3 characters.";
    }

    if (!email) {
      nextErrors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!mobileNumber) {
      nextErrors.mobileNumber = "Mobile number is required.";
    } else if (!MOBILE_REGEX.test(mobileNumber)) {
      nextErrors.mobileNumber = "Enter a valid 10-digit mobile number.";
    }

    if (location && location.length < 3) {
      nextErrors.location = "Location must be at least 3 characters.";
    }

    // CHANGE (Req #1): Quantity is now mandatory, with its own required message,
    // followed by the minimum-quantity message when a value is provided but too low.
    if (!data.quantity) {
      nextErrors.quantity = "Estimated quantity is required.";
    } else if (Number(data.quantity) < MIN_ORDER_QUANTITY) {
      nextErrors.quantity = `Minimum order quantity is ${MIN_ORDER_QUANTITY} bottles.`;
    }

    if (!requirements) {
      nextErrors.requirements = "Please tell us your requirements.";
    } else if (requirements.length < 10) {
      nextErrors.requirements = "Requirements must be at least 10 characters.";
    }

    return nextErrors;
  }, []);

  // CHANGE (Req #4): scrolls to and focuses the first field (in visual order) that
  // has a validation error, without altering the form layout.
  const focusFirstInvalidField = useCallback((validationErrors) => {
    const firstErrorField = FIELD_ORDER.find(
      (field) => validationErrors[field],
    );
    const node = firstErrorField && fieldRefs.current[firstErrorField];

    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      // preventScroll avoids a second, competing jump since we already scrolled smoothly above
      node.focus({ preventScroll: true });
    }
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      // Prevent duplicate submissions (e.g. double click / double Enter)
      // CHANGE (Req #10): also bail out if a submission already succeeded once
      // and this handler somehow fires again before the component re-renders.
      if (loading || hasSubmittedRef.current) return;

      // Login required to submit a Bulk Order request. Checked before
      // validation — a logged-out visitor should be sent to log in
      // immediately, not shown field-level errors first. Returning here
      // (rather than auto-submitting) means the user lands back on this
      // same form after login and re-clicks "Request a Quote" themselves.
      if (!user) {
        toast.error("Please log in to submit a bulk order request.");
        navigate("/login", {
          state: { from: { pathname: BULK_ORDER_ROUTE } },
        });
        return;
      }

      const validationErrors = validate(formData);

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        toast.error("Please fix the highlighted fields before submitting.");
        // CHANGE (Req #4): auto-scroll to and focus the first invalid field
        focusFirstInvalidField(validationErrors);
        return;
      }

      // Trim all text fields before sending to the backend.
      const payload = {
        ...formData,
        companyName: formData.companyName.trim(),
        contactPerson: formData.contactPerson.trim(),
        email: formData.email.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        location: formData.location.trim(),
        requirements: formData.requirements.trim(),
      };

      try {
        setLoading(true);

        const response = await axios.post("/api/bulk-bookings", payload);

        toast.success(SUCCESS_MESSAGE);

        setFormData(INITIAL_FORM_STATE);
        setErrors({});

        // Smoothly scroll the user back to the top so they see the success state / hero
        window.scrollTo({ top: 0, behavior: "smooth" });

        // CHANGE (Req #1): show the success card. Booking number is displayed
        // automatically if/when the backend starts returning one — no API change today.
        hasSubmittedRef.current = true;
        setBookingNumber(response?.data?.bookingNumber ?? null);
        setSubmitted(true);
      } catch (error) {
        // CHANGE (Req #5): layered error handling —
        // 1) no response at all (connectivity/network failure)
        // 2) session expired/invalid between page load and submit (defense
        //    in depth — the pre-submit `user` check above already covers
        //    the common case)
        // 3) backend responded with a message
        // 4) backend responded without a usable message
        if (!error?.response) {
          toast.error(NETWORK_ERROR_MESSAGE);
        } else if (error.response.status === 401) {
          toast.error("Please log in to submit a bulk order request.");
          navigate("/login", {
            state: { from: { pathname: BULK_ORDER_ROUTE } },
          });
        } else {
          const backendMessage = error?.response?.data?.message;
          toast.error(backendMessage || GENERIC_ERROR_MESSAGE);
        }
      } finally {
        setLoading(false);
      }
    },
    [formData, loading, validate, focusFirstInvalidField, user, navigate],
  );

  // CHANGE (Req #1): "Submit Another Enquiry" — hides the success card and shows
  // the (already-cleared) form again.
  const handleSubmitAnother = useCallback(() => {
    hasSubmittedRef.current = false;
    setBookingNumber(null);
    setSubmitted(false);
  }, []);

  const inputBaseClasses =
    "w-full rounded-2xl border bg-[#FAFCF8] px-5 py-4 outline-none transition-colors focus:border-[#7FA35C] disabled:cursor-not-allowed disabled:opacity-60";

  const getInputClasses = (field) =>
    `${inputBaseClasses} ${
      errors[field] ? "border-red-400 focus:border-red-400" : "border-[#DCE6D4]"
    }`;

  // CHANGE (Req #7): live quantity helper — swaps between the default helper,
  // a "need N more" message, and an eligibility confirmation.
  const quantityValue = Number(formData.quantity) || 0;
  const quantityHelperText = !formData.quantity
    ? `Minimum order quantity: ${MIN_ORDER_QUANTITY} bottles.`
    : quantityValue < MIN_ORDER_QUANTITY
      ? `Minimum Order Quantity is ${MIN_ORDER_QUANTITY} Bottles. Need ${
          MIN_ORDER_QUANTITY - quantityValue
        } more bottles.`
      : "✅ Eligible for Bulk Order";
  const quantityHelperClasses =
    formData.quantity && quantityValue >= MIN_ORDER_QUANTITY
      ? "mt-1.5 text-sm font-medium text-[#7FA35C]"
      : "mt-1.5 text-sm text-[#667085]";

  return (
    <section className="bg-[#F8FAF4] pt-32 pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="mb-16 text-center sm:mb-20">
          <span className="inline-flex items-center rounded-full border border-[#DCE6D4] bg-white px-5 py-2 text-sm font-medium text-[#7FA35C]">
            BULK & CORPORATE BOOKINGS
          </span>

          <h1 className="mt-6 text-4xl font-light leading-tight text-[#2D3A2E] sm:text-5xl md:text-6xl">
            Healthy Refreshments
            <br />
            <span className="font-semibold">For Teams & Celebrations</span>
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base text-[#667085] sm:text-lg">
            At BREE, we bring fresh, healthy and naturally crafted detox drinks
            to corporate orders, office wellness programs, events, exhibitions,
            retailers, distributors and bulk buyers across India, with
            customized pricing based on quantity.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-16 grid gap-6 sm:mb-20 sm:grid-cols-3">
          <div className="flex h-full flex-col justify-center rounded-3xl border border-[#E7ECE3] bg-white p-6 text-center shadow-sm sm:p-8">
            <h3 className="text-3xl font-bold text-[#7FA35C] sm:text-4xl">
              {MIN_ORDER_QUANTITY} Bottles
            </h3>
            <p className="mt-2 text-[#667085]">Minimum Order</p>
          </div>

          <div className="flex h-full flex-col justify-center rounded-3xl border border-[#E7ECE3] bg-white p-6 text-center shadow-sm sm:p-8">
            <h3 className="text-3xl font-bold text-[#7FA35C] sm:text-4xl">
              Available
            </h3>
            <p className="mt-2 text-[#667085]">Custom Branding</p>
          </div>

          <div className="flex h-full flex-col justify-center rounded-3xl border border-[#E7ECE3] bg-white p-6 text-center shadow-sm sm:p-8">
            <h3 className="text-3xl font-bold text-[#7FA35C] sm:text-4xl">
              PAN India
            </h3>
            <p className="mt-2 text-[#667085]">Service Coverage</p>
          </div>
        </div>

        {/* Services */}
        <div className="mb-16 grid gap-8 sm:mb-20 md:grid-cols-3">
          <div className="flex h-full flex-col rounded-3xl border border-[#E7ECE3] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <h3 className="mb-4 text-2xl font-semibold text-[#2D3A2E]">
              Corporate Orders
            </h3>

            <ul className="space-y-3 text-[#667085]">
              <li>✓ Employee wellness programs</li>
              <li>✓ Office pantry supplies</li>
              <li>✓ Team meetings and conferences</li>
              <li>✓ Client events and corporate gifting</li>
            </ul>
          </div>

          <div className="flex h-full flex-col rounded-3xl border border-[#E7ECE3] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <h3 className="mb-4 text-2xl font-semibold text-[#2D3A2E]">
              Event Bookings
            </h3>

            <ul className="space-y-3 text-[#667085]">
              <li>✓ Exhibitions & Trade Shows</li>
              <li>✓ Product Launches</li>
              <li>✓ Workshops & Seminars</li>
              <li>✓ Weddings & Celebrations</li>
              <li>✓ Fitness & Wellness Events</li>
            </ul>
          </div>

          <div className="flex h-full flex-col rounded-3xl border border-[#E7ECE3] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
            <h3 className="mb-4 text-2xl font-semibold text-[#2D3A2E]">
              Subscription Plans
            </h3>

            <ul className="space-y-3 text-[#667085]">
              <li>✓ Offices</li>
              <li>✓ Co-working Spaces</li>
              <li>✓ Gyms & Fitness Centers</li>
              <li>✓ Wellness Clinics</li>
            </ul>
          </div>
        </div>

        {/* Branding & MOQ */}
        <div className="mb-16 grid gap-8 sm:mb-20 lg:grid-cols-2">
          <div className="rounded-3xl border border-[#DCE6D4] bg-[#F2F7EC] p-8">
            <h3 className="mb-5 text-2xl font-semibold text-[#2D3A2E] sm:text-3xl">
              Custom Branding Available
            </h3>

            <ul className="space-y-4 text-[#667085]">
              <li>✓ Customized bottle labels</li>
              <li>✓ Corporate logo branding</li>
              <li>✓ Personalized event messages</li>
              <li>✓ Special packaging for gifting</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-[#DCE6D4] bg-white p-8">
            <h3 className="mb-5 text-2xl font-semibold text-[#2D3A2E] sm:text-3xl">
              Minimum Order Quantity
            </h3>

            <ul className="space-y-4 text-[#667085]">
              <li>✓ Bulk orders start from {MIN_ORDER_QUANTITY} bottles</li>
              <li>✓ Special pricing available for larger quantities</li>
              <li>✓ Advance booking recommended</li>
            </ul>
          </div>
        </div>

        {/* How Bulk Orders Work */}
        {/* CHANGE (Req #9): presentation-only overhaul — step icons, connector lines,
            tighter spacing, and a layout that stacks vertically (with a vertical
            connector) on small screens and grids out (with a horizontal connector)
            from `sm` upward. Step numbers, titles, descriptions, and order are
            untouched. */}
        <div className="mb-16 sm:mb-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-light text-[#2D3A2E] sm:text-4xl">
              How <span className="font-semibold">Bulk Orders Work</span>
            </h2>
            <p className="mt-3 text-[#667085]">
              A simple, transparent process from enquiry to delivery.
            </p>
          </div>

          <ol className="grid gap-6 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
            {ORDER_STEPS.map(({ step, icon, title, description }, index) => (
              <li key={step} className="relative flex gap-4 sm:block sm:gap-0">
                {index !== ORDER_STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[17px] top-9 z-0 h-[calc(100%+0.5rem)] w-px bg-[#DCE6D4] sm:left-9 sm:top-[17px] sm:h-px sm:w-[calc(100%-2.25rem)]"
                  />
                )}
                <span className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F2F7EC] text-sm font-semibold text-[#7FA35C] ring-4 ring-[#F8FAF4]">
                  {step}
                </span>
                <div className="flex h-full flex-1 flex-col rounded-2xl border border-[#E7ECE3] bg-white p-6 shadow-sm sm:mt-4">
                  <span
                    aria-hidden="true"
                    className="mb-1 text-xl leading-none"
                  >
                    {icon}
                  </span>
                  <h3 className="text-base font-semibold text-[#2D3A2E]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-[#667085]">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Form / Success */}
        <div className="rounded-[24px] border border-[#E7ECE3] bg-white p-6 shadow-sm sm:rounded-[32px] sm:p-8 md:p-12">
          {submitted ? (
            // CHANGE (Req #1): success confirmation card, shown in place of the form.
            <div className="mx-auto max-w-2xl py-6 text-center sm:py-10">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F2F7EC] text-3xl">
                ✅
              </div>

              <h2 className="text-2xl font-semibold text-[#2D3A2E] sm:text-3xl">
                Quote Request Submitted Successfully
              </h2>

              <p className="mt-3 text-[#667085]">
                Thank you for contacting BREE Wellness. Our team has received
                your enquiry.
              </p>

              {bookingNumber && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#DCE6D4] bg-[#F2F7EC] px-4 py-2 text-sm font-medium text-[#2D3A2E]">
                  Booking Number: {bookingNumber}
                </p>
              )}

              <div className="mt-8 rounded-2xl border border-[#E7ECE3] bg-[#FAFCF8] p-6 text-left sm:p-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#2D3A2E]">
                  Next Steps
                </h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#667085]">
                  <li>✔ Our team will review your enquiry.</li>
                  <li>✔ You will receive an Email acknowledgement.</li>
                  <li>✔ You will receive a WhatsApp acknowledgement.</li>
                  <li>✔ A customized quotation will be shared after review.</li>
                </ul>
              </div>

              <p className="mt-6 text-sm text-[#667085]">
                <span className="font-semibold text-[#2D3A2E]">
                  Expected Response Time:
                </span>{" "}
                Within 24 Hours
              </p>

              <button
                type="button"
                onClick={handleSubmitAnother}
                className="mt-8 inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#7FA35C] px-8 py-3 font-medium text-white transition-all hover:scale-[1.01] hover:bg-[#6E9250]"
              >
                Submit Another Enquiry
              </button>
            </div>
          ) : (
            <>
              <div className="mb-10 text-center">
                <h2 className="text-3xl font-light text-[#2D3A2E] sm:text-4xl">
                  Request a <span className="font-semibold">Quote</span>
                </h2>

                <p className="mt-3 text-[#667085]">
                  Our team will get back to you with a customized quotation.
                </p>
              </div>

              {/* Important / disclaimer card */}
              <div className="mb-8 rounded-2xl border border-[#F0C36D]/40 bg-[#FFF9EC] p-5 sm:p-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#8A6D1D]">
                  Important
                </h3>
                <ul className="space-y-1.5 text-sm text-[#7A6428]">
                  {NOTE_ITEMS.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <form
                onSubmit={handleSubmit}
                noValidate
                aria-busy={loading}
                className="grid gap-6 md:grid-cols-2"
              >
                <fieldset disabled={loading} className="contents">
                  <legend className="sr-only">Bulk enquiry form</legend>

                  <div>
                    <label
                      htmlFor="companyName"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Company / Organization Name{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="companyName"
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      onBlur={handleBlurTrim}
                      placeholder="e.g. Acme Technologies Pvt Ltd"
                      required
                      autoComplete="organization"
                      // CHANGE (Req #6): explicit max length guard.
                      maxLength={FIELD_MAX_LENGTHS.companyName}
                      aria-required="true"
                      aria-label="Company or organization name"
                      aria-invalid={Boolean(errors.companyName)}
                      aria-describedby={
                        errors.companyName ? "companyName-error" : undefined
                      }
                      ref={(el) => {
                        fieldRefs.current.companyName = el;
                      }}
                      className={getInputClasses("companyName")}
                    />
                    {errors.companyName && (
                      <p
                        id="companyName-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.companyName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contactPerson"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Contact Person <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="contactPerson"
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleChange}
                      onBlur={handleBlurTrim}
                      placeholder="e.g. Priya Sharma"
                      required
                      autoComplete="name"
                      // CHANGE (Req #6): explicit max length guard.
                      maxLength={FIELD_MAX_LENGTHS.contactPerson}
                      aria-required="true"
                      aria-label="Contact person name"
                      aria-invalid={Boolean(errors.contactPerson)}
                      aria-describedby={
                        errors.contactPerson ? "contactPerson-error" : undefined
                      }
                      ref={(el) => {
                        fieldRefs.current.contactPerson = el;
                      }}
                      className={getInputClasses("contactPerson")}
                    />
                    {errors.contactPerson && (
                      <p
                        id="contactPerson-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.contactPerson}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="e.g. priya@company.com"
                      required
                      autoComplete="email"
                      inputMode="email"
                      aria-required="true"
                      aria-label="Email address"
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={
                        errors.email ? "email-error" : undefined
                      }
                      ref={(el) => {
                        fieldRefs.current.email = el;
                      }}
                      className={getInputClasses("email")}
                    />
                    {errors.email && (
                      <p
                        id="email-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="mobileNumber"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="mobileNumber"
                      type="tel"
                      name="mobileNumber"
                      // CHANGE (Req #4): display the "98765 43210" formatted value while
                      // formData.mobileNumber (submitted/validated) stays raw digits only.
                      value={formatMobileForDisplay(formData.mobileNumber)}
                      onChange={handleChange}
                      placeholder="e.g. 98765 43210"
                      required
                      autoComplete="tel"
                      inputMode="numeric"
                      // CHANGE (Req #2/#4): 11 to account for the display space; the
                      // underlying stored value is still capped to 10 raw digits in
                      // handleChange.
                      maxLength={11}
                      aria-required="true"
                      aria-label="Mobile number"
                      aria-invalid={Boolean(errors.mobileNumber)}
                      aria-describedby={
                        errors.mobileNumber ? "mobileNumber-error" : undefined
                      }
                      ref={(el) => {
                        fieldRefs.current.mobileNumber = el;
                      }}
                      className={getInputClasses("mobileNumber")}
                    />
                    {errors.mobileNumber && (
                      <p
                        id="mobileNumber-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.mobileNumber}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="location"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Location
                    </label>
                    <input
                      id="location"
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      onBlur={handleBlurTrim}
                      placeholder="e.g. Bengaluru, Karnataka"
                      autoComplete="address-level2"
                      // CHANGE (Req #6): explicit max length guard.
                      maxLength={FIELD_MAX_LENGTHS.location}
                      aria-label="Location"
                      aria-invalid={Boolean(errors.location)}
                      aria-describedby={
                        errors.location ? "location-error" : undefined
                      }
                      ref={(el) => {
                        fieldRefs.current.location = el;
                      }}
                      className={getInputClasses("location")}
                    />
                    {errors.location && (
                      <p
                        id="location-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.location}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="quantity"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      {/* CHANGE (Req #1): Quantity is now a required field, reflected with the asterisk */}
                      Estimated Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="quantity"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      name="quantity"
                      // CHANGE (Req #1 & #3): minimum, step, and required attribute updated to
                      // enforce a mandatory, positive-integer quantity of at least 100.
                      min={MIN_ORDER_QUANTITY}
                      step="1"
                      required
                      value={formData.quantity}
                      onChange={handleChange}
                      onKeyDown={handleQuantityKeyDown}
                      placeholder="e.g. 250"
                      autoComplete="off"
                      aria-required="true"
                      aria-label="Estimated quantity in bottles"
                      aria-invalid={Boolean(errors.quantity)}
                      aria-describedby="quantity-helper quantity-error"
                      ref={(el) => {
                        fieldRefs.current.quantity = el;
                      }}
                      className={getInputClasses("quantity")}
                    />
                    {/* CHANGE (Req #7): helper text now updates live as the user types. */}
                    <p id="quantity-helper" className={quantityHelperClasses}>
                      {quantityHelperText}
                    </p>
                    {errors.quantity && (
                      <p
                        id="quantity-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.quantity}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="requirements"
                      className="mb-1.5 block text-sm font-medium text-[#2D3A2E]"
                    >
                      Additional Requirements{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="requirements"
                      rows="5"
                      name="requirements"
                      value={formData.requirements}
                      onChange={handleChange}
                      placeholder="Tell us about your event, expected quantity, delivery location, preferred delivery schedule, branding requirements, or any special instructions."
                      required
                      // CHANGE (Req #2/#6): hard cap of 1000 characters.
                      maxLength={REQUIREMENTS_MAX_LENGTH}
                      aria-required="true"
                      aria-label="Additional requirements"
                      aria-invalid={Boolean(errors.requirements)}
                      aria-describedby={`requirements-counter ${
                        errors.requirements ? "requirements-error" : ""
                      }`.trim()}
                      ref={(el) => {
                        fieldRefs.current.requirements = el;
                      }}
                      className={`${getInputClasses("requirements")} min-h-[140px] resize-y`}
                    />
                    {/* CHANGE (Req #2): live character counter. */}
                    <div
                      id="requirements-counter"
                      className="mt-1.5 text-right text-xs text-[#98A2B3]"
                    >
                      {formData.requirements.length} / {REQUIREMENTS_MAX_LENGTH}{" "}
                      Characters
                    </div>
                    {errors.requirements && (
                      <p
                        id="requirements-error"
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-sm text-red-500"
                      >
                        {errors.requirements}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    aria-disabled={loading}
                    aria-label={
                      loading ? "Submitting request" : "Request a quote"
                    }
                    className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-full bg-[#7FA35C] px-8 py-3 font-medium text-white transition-all hover:scale-[1.01] hover:bg-[#6E9250] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7FA35C] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:col-span-2"
                  >
                    {loading ? (
                      // CHANGE (Req #3): richer loading state — spinner plus a two-line message.
                      <>
                        <span className="flex items-center gap-2">
                          <svg
                            className="h-5 w-5 animate-spin text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            />
                          </svg>
                          Submitting your enquiry...
                        </span>
                        <span className="text-xs font-normal text-white/80">
                          Please wait while we send your request...
                        </span>
                      </>
                    ) : (
                      "Request a Quote"
                    )}
                  </button>
                </fieldset>
              </form>
            </>
          )}
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-[32px] bg-gradient-to-r from-[#203520] to-[#2D4A2D] px-6 py-12 text-center text-white sm:mt-24 sm:rounded-[40px] sm:px-8 sm:py-16">
          <h3 className="text-3xl font-light sm:text-4xl md:text-5xl">
            Hydrate. Refresh. <span className="font-semibold">Thrive.</span>
          </h3>

          <p className="mt-4 text-base text-white/80 sm:text-lg">
            Healthy Refreshments for Teams, Events & Corporate Gatherings.
          </p>

          <p className="mt-3 text-sm text-white/70">
            Have a custom requirement? Reach out to our team for tailored
            corporate pricing and dedicated support.
          </p>
        </div>

        {/* CHANGE (Req #8): support card with call / WhatsApp / email actions. */}
        <div className="mt-10 rounded-3xl border border-[#E7ECE3] bg-white p-8 text-center shadow-sm sm:p-10">
          <h3 className="text-xl font-semibold text-[#2D3A2E] sm:text-2xl">
            Need Immediate Assistance?
          </h3>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <a
              href={`tel:${CONTACT_PHONE_DIAL}`}
              className="flex items-center justify-center gap-2 rounded-2xl border border-[#DCE6D4] bg-[#FAFCF8] px-5 py-4 font-medium text-[#2D3A2E] transition-colors hover:border-[#7FA35C]"
            >
              📞 Call Us
            </a>
            <a
              href={`https://wa.me/${CONTACT_WHATSAPP_DIGITS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl border border-[#DCE6D4] bg-[#FAFCF8] px-5 py-4 font-medium text-[#2D3A2E] transition-colors hover:border-[#7FA35C]"
            >
              💬 WhatsApp Us
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center justify-center gap-2 rounded-2xl border border-[#DCE6D4] bg-[#FAFCF8] px-5 py-4 font-medium text-[#2D3A2E] transition-colors hover:border-[#7FA35C]"
            >
              ✉️ Email Us
            </a>
          </div>

          <p className="mt-4 text-xs text-[#98A2B3]">
            {CONTACT_PHONE_DISPLAY} · {CONTACT_EMAIL}
          </p>
        </div>
      </div>
    </section>
  );
}
