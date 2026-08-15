import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Droplets,
  Sun,
  Heart,
  Leaf,
  Shield,
  Timer,
  Check,
  Star,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Bottle3D from "@/components/Bottle3D";
import ProductCard from "@/components/ProductCard";
import { useCart } from "@/context/CartContext";
import { useProductsSync } from "@/hooks/useProductsSync";
import { FaUserCircle } from "react-icons/fa";

import { useState, useEffect, useMemo } from "react";
import axios from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";
import TestimonialForm from "@/components/TestimonialForm";

const BENEFITS = [
  {
    id: "benefit-1",
    icon: Sparkles,
    title: "Rich in Vitamin C",
    desc: "20x more than oranges",
  },
  {
    id: "benefit-2",
    icon: Shield,
    title: "Boosts Immunity",
    desc: "Natural defense system",
  },
  {
    id: "benefit-3",
    icon: Droplets,
    title: "Detox & Cleanse",
    desc: "Purify from within",
  },
  {
    id: "benefit-4",
    icon: Sun,
    title: "Glowing Skin",
    desc: "Radiate natural beauty",
  },
];

const STEPS = [
  { id: "step-1", step: 1, title: "Shake", desc: "Gently shake the bottle" },
  { id: "step-2", step: 2, title: "Drink", desc: "Take your daily shot" },
  { id: "step-3", step: 3, title: "Glow", desc: "Feel the difference" },
];

const WHY_BREE = [
  {
    id: "why-1",
    icon: Leaf,
    title: "100% Natural",
    desc: "Pure Amla extract with no additives",
  },
  {
    id: "why-2",
    icon: Shield,
    title: "No Preservatives",
    desc: "Fresh and pure, every sip",
  },
  {
    id: "why-3",
    icon: Heart,
    title: "Daily Ritual",
    desc: "Simple path to wellness",
  },
  {
    id: "why-4",
    icon: Timer,
    title: "Quick & Easy",
    desc: "60 seconds to better health",
  },
];

const Home = () => {
  const fadeInUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.6 },
  };

  const [testimonials, setTestimonials] = useState([]);
  const [testimonialsLoading, setTestimonialsLoading] = useState(true);
  const [testimonialsError, setTestimonialsError] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);

  useEffect(() => {
    const fetchTestimonials = async () => {
      setTestimonialsLoading(true);
      setTestimonialsError(null);
      try {
        const res = await axios.get("/api/testimonials");
        setTestimonials(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Unable to load testimonials:", error);
        setTestimonialsError(getApiErrorMessage(error));
        setTestimonials([]);
      } finally {
        setTestimonialsLoading(false);
      }
    };

    fetchTestimonials();
  }, []);

  useEffect(() => {
    const fetchHomeProducts = async () => {
      setProductsLoading(true);
      setProductsError(null);
      try {
        const res = await axios.get("/api/products/home");
        setProducts(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Unable to load home products:", error);
        setProductsError(getApiErrorMessage(error));
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };

    fetchHomeProducts();
  }, []);

  // Listen for product updates via Socket.IO
  useProductsSync((eventType, product) => {
    // console.log(`🔄 Home: Product ${eventType}`, product?.id);
    // Refetch home products to stay in sync
    const refetchHomeProducts = async () => {
      try {
        const res = await axios.get("/api/products/home");
        setProducts(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Error refetching home products:", error);
      }
    };
    refetchHomeProducts();
  });

  // testimonials carousel logic
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    if (testimonials.length <= 3) return;

    const interval = setInterval(() => {
      setCurrentTestimonialIndex((prev) => {
        const nextIndex = prev + 3;

        return nextIndex >= testimonials.length ? 0 : nextIndex;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [testimonials]);

  const visibleTestimonials = useMemo(() => {
    return testimonials.slice(
      currentTestimonialIndex,
      currentTestimonialIndex + 3,
    );
  }, [testimonials, currentTestimonialIndex]);

  return (
    <>
      <Helmet>
        <title>BREE — Pure Amla Wellness Shots</title>
        <meta
          name="description"
          content="BREE is India's premium Amla wellness shot — pure, cold-pressed, no preservatives. Shop the 7-Pack Trial or 30-Pack Monthly Box."
        />
      </Helmet>
      <div className="overflow-hidden">
        {/* Hero Section */}
        <section
          data-testid="hero-section"
          className="relative min-h-screen flex items-center hero-gradient pt-20"
        >
          {/* Background Gradient Blob */}
          <div className="absolute top-1/2 right-0 w-[600px] h-[600px] gradient-blob transform translate-x-1/4 -translate-y-1/2" />

          <div className="max-w-7xl mx-auto px-6 md:px-12 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Text Content */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className="space-y-8"
              >
                <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                  Pure Amla Wellness
                </span>
                <h1 className="font-outfit text-5xl md:text-6xl lg:text-7xl tracking-tighter leading-none font-light text-bree-text-primary">
                  Pure.
                  <br />
                  <span className="font-normal">Powerful.</span>
                  <br />
                  Daily Wellness.
                </h1>
                <p className="text-lg text-bree-text-secondary leading-relaxed max-w-md">
                  Experience the ancient power of Amla in a modern wellness
                  shot. Rise. Sip. Glow.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/shop">
                    <Button
                      data-testid="hero-shop-now"
                      className="bg-bree-primary hover:bg-bree-primary-hover text-white px-8 py-6 rounded-full text-base font-medium transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl"
                    >
                      Shop Now
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </Link>
                  <Link to="/benefits">
                    <Button
                      variant="outline"
                      data-testid="hero-explore"
                      className="border-bree-primary text-bree-primary hover:bg-bree-accent/20 px-8 py-6 rounded-full text-base font-medium"
                    >
                      Explore Benefits
                    </Button>
                  </Link>
                </div>
              </motion.div>

              {/* Right: 3D Bottle */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="h-[500px] lg:h-[600px]"
              >
                <Bottle3D className="w-full h-full" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section
          data-testid="benefits-section"
          className="py-24 md:py-32 bg-white"
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <motion.div {...fadeInUp} className="text-center mb-16">
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                The Power of Amla
              </span>
              <h2 className="font-outfit text-3xl md:text-4xl tracking-tight leading-tight font-normal text-bree-text-primary mt-4">
                Why Amla?
              </h2>
              <p className="text-bree-text-secondary mt-4 max-w-2xl mx-auto">
                Discover the time-tested benefits of this ancient superfruit
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {BENEFITS.map((benefit, index) => (
                <motion.div
                  key={benefit.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-bree-bg p-8 rounded-3xl text-center hover:shadow-lg transition-shadow"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-bree-accent/30 flex items-center justify-center">
                    <benefit.icon className="w-8 h-8 text-bree-primary" />
                  </div>
                  <h3 className="font-outfit text-xl font-semibold text-bree-text-primary mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-bree-text-secondary text-sm">
                    {benefit.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Showcase */}
        <section
          data-testid="pricing-section"
          className="py-24 md:py-32 bg-bree-bg"
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <motion.div {...fadeInUp} className="text-center mb-16">
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                Our Products
              </span>
              <h2 className="font-outfit text-3xl md:text-4xl tracking-tight leading-tight font-normal text-bree-text-primary mt-4">
                Choose Your Wellness Subscription
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {productsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-white rounded-3xl p-6 min-h-[260px]"
                  />
                ))
              ) : productsError ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
                  <p className="font-semibold mb-2">Unable to load products</p>
                  <p>{productsError}</p>
                </div>
              ) : products.length === 0 ? (
                <div className="rounded-3xl border border-bree-border bg-bree-bg p-12 text-center">
                  <p className="text-xl font-semibold text-bree-text-primary mb-2">
                    No products available
                  </p>
                  <p className="text-bree-text-secondary">
                    Products will appear here once added from the admin panel.
                  </p>
                </div>
              ) : (
                products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section
          data-testid="how-it-works-section"
          className="py-24 md:py-32 bg-white"
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <motion.div {...fadeInUp} className="text-center mb-16">
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                Simple Ritual
              </span>
              <h2 className="font-outfit text-3xl md:text-4xl tracking-tight leading-tight font-normal text-bree-text-primary mt-4">
                How It Works
              </h2>
            </motion.div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
              {STEPS.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.15 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="step-circle bg-bree-primary text-white mb-4 font-outfit">
                    {step.step}
                  </div>
                  <h3 className="font-outfit text-2xl font-semibold text-bree-text-primary mb-2">
                    {step.title}
                  </h3>
                  <p className="text-bree-text-secondary">{step.desc}</p>
                  {index < STEPS.length - 1 && (
                    <div className="hidden md:block absolute">
                      <ArrowRight className="w-8 h-8 text-bree-border transform translate-x-[120px] -translate-y-16" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Why BREE */}
        <section
          data-testid="why-bree-section"
          className="py-24 md:py-32 bg-bree-bg"
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="max-w-3xl mx-auto">
              <motion.div {...fadeInUp} className="text-center mb-12">
                <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                  Why Choose Us
                </span>
                <h2 className="font-outfit text-3xl md:text-4xl tracking-tight leading-tight font-normal text-bree-text-primary mt-4 mb-8">
                  Why BREE?
                </h2>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {WHY_BREE.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="flex items-start gap-4 bg-white p-6 rounded-2xl"
                  >
                    <div className="w-12 h-12 rounded-xl bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-6 h-6 text-bree-primary" />
                    </div>
                    <div>
                      <h3 className="font-outfit text-lg font-semibold text-bree-text-primary">
                        {item.title}
                      </h3>
                      <p className="text-bree-text-secondary text-sm mt-1">
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>
        {/* -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- */}
        {/* Testimonials */}
        <section
          data-testid="testimonials-section"
          className="py-24 md:py-32 bg-white"
        >
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <motion.div {...fadeInUp} className="text-center mb-16">
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                Real Stories
              </span>
              <h2 className="font-outfit text-3xl md:text-4xl tracking-tight leading-tight font-normal text-bree-text-primary mt-4">
                What Our Customers Say
              </h2>
            </motion.div>

            {testimonialsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="animate-pulse bg-bree-bg rounded-3xl p-8 min-h-[260px]"
                  />
                ))}
              </div>
            ) : testimonialsError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
                <p className="font-semibold mb-2">
                  Unable to load testimonials
                </p>
                <p>{testimonialsError}</p>
              </div>
            ) : testimonials.length === 0 ? (
              <div className="rounded-3xl border border-bree-border bg-bree-bg p-12 text-center">
                <p className="text-xl font-semibold text-bree-text-primary mb-2">
                  No reviews available yet
                </p>
                <p className="text-bree-text-secondary">
                  Be the first to submit a testimonial and help others discover
                  BREE.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {visibleTestimonials.map((testimonial, index) =>  (
                  <motion.div
                    key={testimonial.id || `testimonial-${index}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="testimonial-card p-8 rounded-3xl transition-all duration-700 animate-fadeIn"
                  >
                    <Quote className="w-10 h-10 text-bree-accent mb-4" />
                    <p className="text-bree-text-secondary leading-relaxed mb-6">
                      "{testimonial.text}"
                    </p>
                    <div className="flex items-center gap-4">
                      {/* <img
                        src={testimonial.avatar || '/images/default-avatar.png'}
                        alt={testimonial.name}
                        className="w-12 h-12 rounded-full object-cover"
                      /> */}
                      <FaUserCircle className="w-12 h-12 text-bree-text-secondary" />
                      <div>
                        <h4 className="font-outfit font-semibold text-bree-text-primary">
                          {testimonial.name}
                        </h4>
                        <p className="text-bree-text-secondary text-sm">
                          {testimonial.role || "BREE customer"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-4">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < (testimonial.rating || 5) ? "fill-bree-primary text-bree-primary" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          {/* Review Form */}
          <TestimonialForm />
        </section>

        {/* CTA Section */}
        <section
          data-testid="cta-section"
          className="py-24 md:py-32 bg-bree-text-primary"
        >
          <div className="max-w-4xl mx-auto px-6 md:px-12 text-center">
            <motion.div {...fadeInUp}>
              <h2 className="font-outfit text-3xl md:text-5xl tracking-tight leading-tight font-light text-white mb-6">
                Start Your Wellness Routine Today
              </h2>
              <p className="text-white/70 text-lg mb-8 max-w-2xl mx-auto">
                Join thousands who have made BREE a part of their daily ritual.
                Experience the power of pure Amla.
              </p>
              <Link to="/shop">
                <Button
                  data-testid="cta-shop-now"
                  className="bg-bree-primary hover:bg-bree-primary-hover text-white px-10 py-6 rounded-full text-lg font-medium transition-all duration-300 transform hover:-translate-y-1 shadow-lg hover:shadow-xl"
                >
                  Shop Now
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Home;
