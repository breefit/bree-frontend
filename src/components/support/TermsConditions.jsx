import {
  ShoppingBag,
  IndianRupee,
  FileText,
  HeartPulse,
  Copyright,
} from "lucide-react";

const TermsConditions = () => {
  return (
    <section
      id="terms"
      className="scroll-mt-28 max-w-7xl mx-auto px-6 lg:px-8 py-20"
    >
      <div className="mb-14">
        <span className="inline-flex items-center rounded-full bg-[#EEF6ED] px-4 py-2 text-sm font-medium text-[#5C8A4A]">
          Terms & Conditions
        </span>

        <h2 className="mt-6 text-4xl md:text-5xl font-bold text-[#2F4730]">
          BREE Terms & Conditions
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
          By using the BREE website, you agree to the following terms.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Products */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <ShoppingBag className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Products
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            Product images are for representation purposes. Packaging may vary
            slightly.
          </p>
        </div>

        {/* Pricing */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <IndianRupee className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Pricing
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            All prices are listed in Indian Rupees (INR) and may change without
            prior notice.
          </p>
        </div>

        {/* Orders */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <FileText className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">Orders</h3>

          <p className="mt-5 text-gray-600 leading-8">
            BREE reserves the right to cancel orders due to stock
            unavailability, pricing errors, or suspected fraudulent activity.
          </p>
        </div>

        {/* Intellectual Property */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Copyright className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Intellectual Property
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            All content, logos, images, and designs on the BREE website are the
            property of BREE.
          </p>
        </div>
      </div>

      {/* Health Disclaimer */}
      <div className="mt-12 rounded-3xl border-l-4 border-[#84A95A] bg-[#EEF6ED] p-10">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white">
            <HeartPulse className="h-8 w-8 text-[#5C8A4A]" />
          </div>

          <div>
            <span className="inline-block rounded-full bg-[#84A95A]/10 px-3 py-1 text-sm font-medium text-[#5C8A4A]">
              Health Disclaimer
            </span>

            <h3 className="mt-4 text-3xl font-semibold text-[#2F4730]">
              Important
            </h3>

            <p className="mt-5 text-gray-700 leading-8">
              BREE is a wellness beverage and is not intended to diagnose,
              treat, cure, or prevent any disease. Please consult a healthcare
              professional if you have any medical conditions or are pregnant or
              breastfeeding.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TermsConditions;
