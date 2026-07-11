import { useEffect, useRef, useState } from "react";

const sections = [
  { id: "shipping", label: "Shipping" },
  { id: "returns", label: "Returns" },
  { id: "privacy", label: "Privacy" },
  { id: "terms", label: "Terms" },
];

const NAV_OFFSET = 110;

const SupportNavigation = () => {
  const [active, setActive] = useState("shipping");
  const buttonRefs = useRef({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);

        if (visible) {
          setActive(visible.target.id);
        }
      },
      {
        rootMargin: `-${NAV_OFFSET}px 0px -55% 0px`,
        threshold: 0.2,
      },
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);

      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const activeButton = buttonRefs.current[active];

    if (!activeButton) return;

    activeButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [active]);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);

    if (!element) return;

    const top =
      element.getBoundingClientRect().top +
      window.pageYOffset -
      NAV_OFFSET -
      20;

    window.scrollTo({
      top,
      behavior: "smooth",
    });

    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="sticky top-[72px] z-40 px-4 py-4 md:hidden">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-full border border-[#E8ECE6] bg-white/95 p-2 shadow-lg backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-2">
            {sections.map((section) => {
              const isActive = active === section.id;

              return (
                <button
                  key={section.id}
                  ref={(el) => {
                    buttonRefs.current[section.id] = el;
                  }}
                  onClick={() => scrollToSection(section.id)}
                  className={`rounded-full px-2 py-2 text-[12px] font-medium transition-all duration-300 sm:px-4 sm:py-2.5 sm:text-sm ${
                    isActive
                      ? "bg-[#2F4730] text-white shadow-md"
                      : "bg-[#F5F7F2] text-[#4B5B4A] hover:bg-[#EEF6ED] hover:text-[#2F4730]"
                  }`}
                >
                  <span className="hidden sm:inline">{section.label}</span>

                  <span className="sm:hidden">
                    {section.label === "Shipping"
                      ? "Ship"
                      : section.label === "Returns"
                        ? "Return"
                        : section.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportNavigation;
