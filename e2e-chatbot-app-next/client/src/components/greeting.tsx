import { motion } from 'framer-motion';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="mx-auto flex size-full max-w-3xl flex-col justify-center px-4 mb-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="space-y-3 text-center"
      >
        <div className="font-semibold text-lg md:text-xl">
          Ask the supervisor to route the request.
        </div>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
          One chat for Knowledge Assistant answers and Genie-backed analysis on
          Databricks.
        </p>
      </motion.div>
    </div>
  );
};
