import vuLogo from "../assets/Vantaa Underground Logo.png";
import { motion } from "framer-motion";

export function Footer() {
    return (
        <motion.footer
            className="border-t border-border mt-auto bg-bg px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:py-[18px] sm:gap-4"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
            <a
                href="https://vantaa-underground.com"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-150"
                aria-label="Vantaa Underground"
            >
                <img
                    src={vuLogo}
                    alt="Vantaa Underground"
                    className="h-7 w-7 rounded-full"
                />
            </a>
            <p className="font-mono text-[0.75rem] text-dim leading-snug">
                Part of the{" "}
                <a
                    href="https://vantaa-underground.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-accent transition-colors duration-150 no-underline"
                >
                    Vantaa Underground
                </a>{" "}
                project.
            </p>
            <p className="font-mono text-[0.75rem] text-dim leading-snug sm:ml-auto shrink-0">
                Made by{" "}
                <a
                    href="https://shchilkin.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-accent transition-colors duration-150 no-underline"
                >
                    Aleksandr Shchilkin
                </a>
            </p>
        </motion.footer>
    );
}
