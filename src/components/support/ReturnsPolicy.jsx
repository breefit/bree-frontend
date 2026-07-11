import { PackageX, BadgeCheck, Camera, Wallet } from "lucide-react";

const ReturnsPolicy = () => {
  return (
    <section
      id="returns"
      className="scroll-mt-28 max-w-7xl mx-auto px-6 lg:px-8 py-20"
    >
      <div className="mb-14">
        <span className="inline-flex items-center rounded-full bg-[#EEF6ED] px-4 py-2 text-sm font-medium text-[#5C8A4A]">
          Returns & Refunds Policy
        </span>

        <h2 className="mt-6 text-4xl md:text-5xl font-bold text-[#2F4730]">
          BREE Returns & Refunds Policy
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
          Due to the consumable nature of wellness products, we do not accept
          returns for opened or used products.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Eligible Cases */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <BadgeCheck className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Eligible Cases
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            Refunds or replacements are provided only if:
          </p>

          <ul className="mt-5 space-y-3 text-gray-600 leading-7">
            <li>• You receive a damaged product.</li>
            <li>• You receive the wrong product.</li>
            <li>• The product has a manufacturing defect.</li>
          </ul>
        </div>

        {/* How to Request */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Camera className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            How to Request
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            Contact us within <strong>48 hours</strong> of delivery with:
          </p>

          <ul className="mt-5 space-y-3 text-gray-600 leading-7">
            <li>• Order number</li>
            <li>• Photos/videos of the issue</li>
            <li>• Unboxing proof (if available)</li>
          </ul>
        </div>

        {/* Refund Timeline */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Wallet className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Refund Timeline
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            Approved refunds will be processed within{" "}
            <strong>5–7 business days</strong> to the original payment method.
          </p>
        </div>
      </div>

      <div className="mt-14 rounded-3xl bg-[#2F4730] p-10 text-white">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <PackageX className="h-8 w-8 text-[#9CCB72]" />
          </div>

          <div>
            <h3 className="text-2xl font-semibold">Returns & Refunds</h3>

            <p className="mt-4 max-w-4xl text-white/80 leading-8">
              Due to the consumable nature of wellness products, we do not
              accept returns for opened or used products. Refunds or
              replacements are provided only for eligible cases mentioned above.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReturnsPolicy;
