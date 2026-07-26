import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const trackingCode = "F40E3DEA";
  const { data: allComplaints, error } = await supabase
    .from("complaints")
    .select("id, citizen_phone, citizen_name, status, category, complaint_text")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching complaints:", error);
    return;
  }

  const found = allComplaints.find((c) => c.id.substring(0, 8).toUpperCase() === trackingCode);
  if (found) {
    console.log("FOUND BY CODE:", found);
  } else {
    console.log(
      "NOT FOUND BY CODE in:",
      allComplaints.map((c) => c.id.substring(0, 8).toUpperCase()),
    );
  }
}

main();
