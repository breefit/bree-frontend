import { Clock3, Truck, PackageCheck, MapPinned } from "lucide-react";

const ShippingPolicy = () => {
  return (
    <section
      id="shipping"
      className="scroll-mt-28 max-w-7xl mx-auto px-6 lg:px-8 py-20"
    >
      <div className="mb-14">
        <span className="inline-flex items-center rounded-full bg-[#EEF6ED] px-4 py-2 text-sm font-medium text-[#5C8A4A]">
          Shipping Policy
        </span>

        <h2 className="mt-6 text-4xl md:text-5xl font-bold text-[#2F4730]">
          BREE Shipping Policy
        </h2>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600">
          We aim to deliver your wellness products quickly and safely.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Order Processing */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Clock3 className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Order Processing
          </h3>

          <ul className="mt-5 space-y-3 text-gray-600 leading-7">
            <li>
              Orders are processed within <strong>1–2 business days</strong>{" "}
              after payment confirmation.
            </li>

            <li>
              Orders placed on Sundays or public holidays will be processed on
              the next working day.
            </li>
          </ul>
        </div>

        {/* Delivery Time */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <Truck className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Delivery Time
          </h3>

          <ul className="mt-5 space-y-3 text-gray-600 leading-7">
            <li>
              Within India: <strong>3–7 business days</strong> depending on the
              location.
            </li>

            <li>
              Delivery timelines may vary during festivals, sales, or courier
              delays.
            </li>
          </ul>
        </div>

        {/* Shipping Charges */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <PackageCheck className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Shipping Charges
          </h3>

          <ul className="mt-5 space-y-3 text-gray-600 leading-7">
            <li>Shipping charges, if applicable, will be shown at checkout.</li>

            <li>Free shipping may be available on selected offers.</li>
          </ul>
        </div>

        {/* Order Tracking */}
        <div className="rounded-3xl border border-[#E8ECE6] bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6ED]">
            <MapPinned className="h-7 w-7 text-[#5C8A4A]" />
          </div>

          <h3 className="mt-6 text-2xl font-semibold text-[#2F4730]">
            Order Tracking
          </h3>

          <p className="mt-5 text-gray-600 leading-8">
            Once your order is dispatched, you will receive a tracking link via
            SMS, email, or WhatsApp.
          </p>
        </div>
      </div>
    </section>
  );
};

export default ShippingPolicy;
