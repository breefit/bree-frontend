import { ShieldCheck } from "lucide-react";

const SupportHero = () => {
  return (
    <section className="relative overflow-hidden bg-[#2F4730]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_45%)]" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white text-sm font-medium backdrop-blur-sm">
          <ShieldCheck size={18} />
          Customer Support
        </div>

        <h1 className="mt-8 text-5xl md:text-6xl font-bold text-white leading-tight">
          Support Center
        </h1>

        <p className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-white/80 leading-8">
          Everything you need to know about shipping, returns, privacy and terms
          for your BREE wellness journey.
        </p>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <a
            href="#shipping"
            className="px-6 py-3 rounded-full bg-white text-[#2F4730] font-semibold hover:scale-105 transition-all duration-300"
          >
            Shipping Policy
          </a>

          <a
            href="#returns"
            className="px-6 py-3 rounded-full border border-white/30 text-white hover:bg-white hover:text-[#2F4730] transition-all duration-300"
          >
            Returns Policy
          </a>
        </div>
      </div>
    </section>
  );
};

export default SupportHero;
