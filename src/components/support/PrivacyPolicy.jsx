import { ShieldCheck, Database, UserCheck, Lock } from "lucide-react";

const PrivacyPolicy = () => {
  return (
    <section
      id="privacy"
      className="scroll-mt-28 max-w-7xl mx-auto px-6 lg:px-8 py-20"
    >
      <div className="mb-14">
        <span className="inline-flex items-center rounded-full bg-[#EEF6ED] px-4 py-2 text-sm font-medium text-[#5C8A4A]">
          Privacy Policy
        </span>

        <h2 className="mt-6 text-4xl md:text-5xl font-bold text-[#2F4730]">
          BREE Privacy Policy
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
          We respect your privacy and protect your personal information.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Information We Collect */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Database className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Information We Collect
          </h3>

          <ul className="mt-6 space-y-3 text-gray-600 leading-7">
            <li>• Name</li>
            <li>• Phone number</li>
            <li>• Email address</li>
            <li>• Shipping address</li>
            <li>• Order details</li>
            <li>
              • Payment information (processed securely by payment partners)
            </li>
          </ul>
        </div>

        {/* How We Use It */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <UserCheck className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            How We Use It
          </h3>

          <ul className="mt-6 space-y-3 text-gray-600 leading-7">
            <li>• Process and deliver orders</li>
            <li>• Provide customer support</li>
            <li>• Send order updates</li>
            <li>• Improve our services</li>
            <li>• Share offers and wellness updates (optional)</li>
          </ul>
        </div>
      </div>

      {/* Data Protection */}
      <div className="mt-12 rounded-3xl bg-[#2F4730] p-10 text-white">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-8 w-8 text-[#9CCB72]" />
          </div>

          <div>
            <h3 className="text-3xl font-semibold">Data Protection</h3>

            <p className="mt-5 max-w-4xl text-white/80 leading-8">
              We do not sell or rent your personal information. Data is shared
              only with trusted delivery and payment partners when necessary.
            </p>
          </div>
        </div>
      </div>

      {/* Additional Cards */}
      <div className="mt-12 grid md:grid-cols-2 gap-8">
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm">
          <Lock className="h-10 w-10 text-[#5C8A4A]" />

          <h4 className="mt-5 text-xl font-semibold text-[#2F4730]">
            Secure Information
          </h4>

          <p className="mt-3 text-gray-600 leading-7">
            Your information is handled securely and used only for the purposes
            described in this Privacy Policy.
          </p>
        </div>

        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm">
          <ShieldCheck className="h-10 w-10 text-[#5C8A4A]" />

          <h4 className="mt-5 text-xl font-semibold text-[#2F4730]">
            Trusted Partners
          </h4>

          <p className="mt-3 text-gray-600 leading-7">
            Information is shared only with trusted delivery and payment
            partners when required to process your order.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PrivacyPolicy;
