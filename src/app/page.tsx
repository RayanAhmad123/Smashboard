import { CTASection } from "@/components/marketing/CTASection";
import { FAQ } from "@/components/marketing/FAQ";
import { Footer } from "@/components/marketing/Footer";
import { Formats } from "@/components/marketing/Formats";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { Nav } from "@/components/marketing/Nav";
import { TVShowcase } from "@/components/marketing/TVShowcase";
import { ValueProps } from "@/components/marketing/ValueProps";
import { WhiteLabel } from "@/components/marketing/WhiteLabel";

export default function Home() {
  return (
    <main
      className="font-sans"
      style={{ backgroundColor: "#ffffff", color: "#0a0a0a" }}
    >
      <Nav />
      <Hero />
      <ValueProps />
      <TVShowcase />
      <Formats />
      <HowItWorks />
      <WhiteLabel />
      <CTASection />
      <FAQ />
      <Footer />
    </main>
  );
}
