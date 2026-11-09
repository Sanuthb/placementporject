import type { AssessmentCategory } from "@/lib/reassessment";

/**
 * Ready-made question banks, original wording. Importing one creates an ordinary question bank (which staff can edit and add to) and a ready
 * paper tagged with the right category, so a placement officer only has to schedule it. Each question has one correct option.
 */
export type StarterQuestion = { text: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3; tag: string; difficulty: "EASY" | "MEDIUM" | "HARD"; explanation: string };
export type StarterBank = { key: string; name: string; topic: string; category: AssessmentCategory; paperTitle: string; durationMin: number; passPercent: number; description: string; questions: StarterQuestion[] };
const q = (text: string, options: [string, string, string, string], answer: 0 | 1 | 2 | 3, tag: string, explanation: string, difficulty: StarterQuestion["difficulty"] = "MEDIUM"): StarterQuestion => ({ text, options, answer, tag, difficulty, explanation });

export const STARTER_BANKS: StarterBank[] = [
  {
    key: "aptitude", name: "Aptitude: quantitative, logical and verbal", topic: "Aptitude", category: "APTITUDE", paperTitle: "Aptitude test (starter)", durationMin: 30, passPercent: 40,
    description: "24 questions: eight each of quantitative, logical reasoning and verbal ability.",
    questions: [
      q("A shop offers a 20% discount on a shirt marked at ₹2,500. What is the selling price?", ["₹1,800", "₹2,000", "₹2,100", "₹2,200"], 1, "quantitative", "20% of 2,500 is 500, so 2,500 − 500 = 2,000.", "EASY"),
      q("The ratio of boys to girls in a class is 3 : 2 and there are 60 students. How many girls are there?", ["20", "24", "30", "36"], 1, "quantitative", "Girls are 2 parts of 5: 60 × 2/5 = 24.", "EASY"),
      q("What is the simple interest on ₹8,000 at 5% per year for 3 years?", ["₹1,000", "₹1,200", "₹1,400", "₹1,500"], 1, "quantitative", "8,000 × 5 × 3 / 100 = 1,200.", "EASY"),
      q("A can finish a job in 12 days and B can finish it in 6 days. Working together, how many days do they need?", ["3", "4", "5", "9"], 1, "quantitative", "Together they do 1/12 + 1/6 = 1/4 of the job a day, so 4 days.", "MEDIUM"),
      q("A train runs at 54 km/h. What is its speed in metres per second?", ["10", "12", "15", "18"], 2, "quantitative", "54 × 1000 / 3600 = 15 m/s.", "MEDIUM"),
      q("The average of five numbers is 24. Four of them add up to 90. What is the fifth?", ["24", "30", "32", "36"], 1, "quantitative", "The total is 5 × 24 = 120, so the fifth is 120 − 90 = 30.", "MEDIUM"),
      q("An item bought for ₹400 is sold for ₹500. What is the profit percentage?", ["20%", "25%", "30%", "40%"], 1, "quantitative", "Profit 100 on cost 400 is 25%.", "EASY"),
      q("If 3x − 7 = 20, what is x?", ["7", "8", "9", "10"], 2, "quantitative", "3x = 27, so x = 9.", "EASY"),
      q("Find the next number: 3, 6, 11, 18, 27, ?", ["36", "38", "40", "42"], 1, "logical", "The differences are 3, 5, 7, 9, so the next difference is 11: 27 + 11 = 38.", "MEDIUM"),
      q("All laptops are devices. Some devices are expensive. Which statement must be true?", ["All laptops are expensive", "Some laptops are expensive", "Some devices are laptops", "No laptop is expensive"], 2, "logical", "Since all laptops are devices, at least some devices are laptops. Nothing is stated about price.", "MEDIUM"),
      q("In a code, BAT is written as CBU. How is DOG written in that code?", ["EPH", "DPH", "EOH", "EPG"], 0, "logical", "Each letter moves one place forward: D→E, O→P, G→H.", "EASY"),
      q("A is to the east of B, B is to the east of C, and D is to the west of C. Who is farthest west?", ["A", "B", "C", "D"], 3, "logical", "West to east the order is D, C, B, A.", "EASY"),
      q("Which number does not belong: 3, 5, 9, 11?", ["3", "5", "9", "11"], 2, "logical", "3, 5 and 11 are prime; 9 is not.", "EASY"),
      q("What is the angle between the hands of a clock at 3:00?", ["60°", "90°", "120°", "180°"], 1, "logical", "At 3:00 the hands are three hours apart, 3 × 30° = 90°.", "EASY"),
      q("Pointing to a man, Rita says, “He is the son of my mother's only brother.” How is the man related to Rita?", ["Brother", "Cousin", "Uncle", "Nephew"], 1, "logical", "Her mother's brother's son is her cousin.", "MEDIUM"),
      q("4 : 64 :: 5 : ?", ["100", "120", "125", "625"], 2, "logical", "4³ = 64, so 5³ = 125.", "MEDIUM"),
      q("Choose the word closest in meaning to “meticulous”.", ["Careless", "Thorough", "Hasty", "Vague"], 1, "verbal", "Meticulous means very careful and thorough.", "MEDIUM"),
      q("Choose the word opposite in meaning to “expand”.", ["Enlarge", "Shrink", "Grow", "Stretch"], 1, "verbal", "To expand is to grow bigger; its opposite is to shrink.", "EASY"),
      q("Fill in the blank: She has been working here ___ 2019.", ["for", "since", "from", "by"], 1, "verbal", "“Since” is used with a starting point in time.", "EASY"),
      q("Choose the correct sentence.", ["Neither of the answers are correct.", "Neither of the answers is correct.", "Neither of the answers were correct.", "Neither of the answers be correct."], 1, "verbal", "“Neither” takes a singular verb.", "MEDIUM"),
      q("What does the idiom “break the ice” mean?", ["Damage something", "Start a conversation in an awkward situation", "Cool a drink quickly", "End a meeting early"], 1, "verbal", "It means to ease the tension at the start of a social situation.", "EASY"),
      q("One word for “a person who speaks many languages”:", ["Polyglot", "Orator", "Pedant", "Novice"], 0, "verbal", "A polyglot knows several languages.", "EASY"),
      q("Choose the correct spelling.", ["Occurence", "Occurrence", "Ocurrence", "Occurance"], 1, "verbal", "Occurrence has double c and double r.", "MEDIUM"),
      q("Remote work reduces commuting time but can blur the line between work and personal life. Teams that agree on working hours report less stress. According to the passage, what is linked to less stress?", ["Longer working hours", "Agreeing on working hours", "Avoiding all commuting", "Working alone"], 1, "verbal", "The passage says teams that agree on working hours report less stress.", "EASY"),
    ],
  },
  {
    key: "digital-literacy", name: "Digital literacy", topic: "Digital literacy", category: "DIGITAL_LITERACY", paperTitle: "Digital literacy test (starter)", durationMin: 20, passPercent: 50,
    description: "15 questions on safe and effective use of everyday digital tools.",
    questions: [
      q("Which password is the strongest?", ["password123", "Sanuth2004", "Tr4in!Bl@ue-Lamp-92", "qwerty"], 2, "security", "Long, mixed and unrelated to personal details is strongest.", "EASY"),
      q("An email says your bank account will be closed unless you click a link and enter your PIN. What should you do?", ["Click and enter the PIN to be safe", "Reply with your account number", "Do not click; contact the bank using its official number or app", "Forward it to friends as a warning"], 2, "security", "Banks do not ask for PINs by email; check using official channels.", "EASY"),
      q("Which file type is a spreadsheet?", [".docx", ".xlsx", ".pptx", ".pdf"], 1, "tools", ".xlsx is the Excel spreadsheet format.", "EASY"),
      q("What does cloud storage mean?", ["Files kept only on your own phone", "Files kept on remote servers you can reach over the internet", "Files kept on a USB stick", "Files that are automatically deleted weekly"], 1, "concepts", "Cloud storage keeps files on remote servers.", "EASY"),
      q("What does Ctrl + Z usually do?", ["Saves the file", "Undoes the last action", "Closes the program", "Prints the page"], 1, "tools", "It reverses the most recent action.", "EASY"),
      q("A website address starts with https://. What does the “s” show?", ["The site is fast", "The connection to the site is encrypted", "The site is free", "The site is run by the government"], 1, "security", "HTTPS encrypts data between you and the site. It does not prove the site is trustworthy.", "MEDIUM"),
      q("What is two-factor authentication?", ["Using two passwords that are the same", "Proving who you are with two different kinds of proof, such as a password and a code", "Logging in from two devices", "Having two email accounts"], 1, "security", "It combines something you know with something you have.", "MEDIUM"),
      q("Which spreadsheet formula adds the values in cells A1 to A5?", ["=ADD(A1:A5)", "=SUM(A1:A5)", "=TOTAL(A1,A5)", "=A1+A5"], 1, "tools", "=SUM(A1:A5) adds the whole range.", "EASY"),
      q("You want a teammate to edit a shared document. What is the safest way to share it?", ["Post the link publicly on social media", "Share it with their specific email address with edit access", "Email the file to everyone in the class", "Share your own password"], 1, "collaboration", "Share with named people and the minimum access needed.", "EASY"),
      q("Why should you back up important files?", ["To make the computer faster", "So you can recover them if the device is lost or fails", "To free up the keyboard", "Backups are not useful"], 1, "concepts", "A backup is a second copy kept for recovery.", "EASY"),
      q("You find a picture online and want to use it in a project report. What should you do first?", ["Use it; anything online is free", "Check its licence and give credit where required", "Remove the watermark", "Crop out the photographer's name"], 1, "ethics", "Images are usually copyrighted; check the licence and credit the source.", "MEDIUM"),
      q("During an online meeting you are not speaking and there is background noise at your place. What is the polite thing to do?", ["Keep the microphone on", "Mute your microphone", "Leave the meeting", "Turn the volume up"], 1, "collaboration", "Muting when not speaking avoids disturbing others.", "EASY"),
      q("In a web search, what does putting a phrase in quotation marks do?", ["Searches for the exact phrase", "Translates the phrase", "Hides the phrase", "Searches only images"], 0, "tools", "Quotes ask for the exact phrase in that order.", "EASY"),
      q("You find a USB drive in the parking lot. What is the safest action?", ["Plug it in to find the owner", "Do not plug it in; hand it to the IT or security office", "Plug it in only on your personal laptop", "Format it and keep it"], 1, "security", "Unknown drives can carry malware.", "MEDIUM"),
      q("What does a version control system such as Git do?", ["Makes a program run faster", "Records changes to files over time so earlier versions can be restored", "Translates code into other languages", "Deletes unused files"], 1, "concepts", "It keeps a history of changes and supports teamwork on code.", "MEDIUM"),
    ],
  },
  {
    key: "communication", name: "Communication: workplace English", topic: "Communication", category: "COMMUNICATION", paperTitle: "Communication test (starter)", durationMin: 15, passPercent: 50,
    description: "10 questions on workplace writing, listening and giving feedback. Pair it with the written communication test.",
    questions: [
      q("Which subject line is best for an email asking to reschedule an interview?", ["Hi", "Urgent!!!", "Request to reschedule interview on Tuesday, 10 am (Priya Nair)", "Please read this"], 2, "writing", "A clear subject tells the reader the topic and the key details.", "EASY"),
      q("Which sentence is the most polite way to ask for a deadline extension?", ["Give me two more days.", "I need more time, the work is too much.", "Would it be possible to extend the deadline to Friday? I want to make sure the work is accurate.", "I can't finish by Wednesday."], 2, "writing", "A polite request gives a specific ask and a reason.", "EASY"),
      q("A colleague is explaining a problem to you. Which behaviour shows active listening?", ["Checking your phone while they talk", "Interrupting with your own solution", "Nodding, keeping eye contact and then summarising what you understood", "Finishing their sentences"], 2, "listening", "Summarising back confirms understanding.", "EASY"),
      q("Which is the best closing for a formal email to a recruiter?", ["Bye", "Thanks!!", "Thank you for your time. Kind regards, Priya Nair", "Reply ASAP"], 2, "writing", "A courteous closing with your name is professional.", "EASY"),
      q("Which version of this sentence is clearest? “The report that was written by me on the topic of sales was submitted by me on Monday.”", ["The sales report, which I wrote, I submitted on Monday.", "I submitted my sales report on Monday.", "On Monday, the submission of the report on sales by me happened.", "The report was submitted, by me, on Monday, about sales."], 1, "writing", "Short, active sentences are clearest.", "MEDIUM"),
      q("A teammate's slide has a mistake. How should you give feedback?", ["Point it out in front of everyone", "Say nothing and fix it yourself later", "Tell them privately and kindly, say what is wrong and suggest a fix", "Tell the manager first"], 2, "feedback", "Private, specific and constructive feedback is most useful.", "MEDIUM"),
      q("You did not understand an instruction from your manager. What is the best response?", ["Pretend you understood and guess", "Ask politely for the part you are unsure about and repeat back what you will do", "Ask a classmate instead", "Wait until the deadline"], 1, "listening", "Clarifying early avoids mistakes.", "EASY"),
      q("In an interview you are asked, “Tell me about yourself.” What is the best approach?", ["Recite your whole life story", "Give a short summary of your studies, key skills and what you want to do next", "Say there is nothing special about you", "Ask the interviewer to ask something else"], 1, "speaking", "A focused 1-2 minute summary tied to the role works best.", "MEDIUM"),
      q("Which message is most appropriate for a professional chat with a senior colleague?", ["hey, send me the file asap", "Hi Mr Shah, could you please send me the project file when convenient? Thank you.", "FILE NOW", "Yo, where is the file"], 1, "writing", "Polite, clear and respectful of the reader's time.", "EASY"),
      q("You are presenting and notice the audience looks confused. What should you do?", ["Speak faster to finish on time", "Pause, ask if anything is unclear and explain the point in simpler words", "Ignore it and continue", "Read the slides aloud"], 1, "speaking", "Watching the audience and adjusting is a core presenting skill.", "MEDIUM"),
    ],
  },
  {
    key: "technical-programming", name: "Technical: programming fundamentals", topic: "Programming (BCA / MCA / B.Tech CS)", category: "TECHNICAL", paperTitle: "Programming fundamentals (starter)", durationMin: 20, passPercent: 50,
    description: "10 questions on core programming ideas, language-neutral.",
    questions: [
      q("What does a loop do?", ["Stops the program", "Repeats a block of instructions", "Stores a value", "Prints a message"], 1, "basics", "A loop repeats code while a condition holds or for each item.", "EASY"),
      q("Which data structure follows last-in, first-out (LIFO)?", ["Queue", "Stack", "Array", "Tree"], 1, "data-structures", "A stack removes the most recently added item first.", "EASY"),
      q("What is the time complexity of searching for an item in a sorted array using binary search?", ["O(n)", "O(log n)", "O(n²)", "O(1)"], 1, "algorithms", "Binary search halves the range each step.", "MEDIUM"),
      q("What is the output of: x = 5; y = x; y = y + 1; print(x)?", ["5", "6", "11", "Error"], 0, "basics", "Numbers are copied by value, so changing y does not change x.", "EASY"),
      q("Which of these is an example of recursion?", ["A function that calls itself", "A loop that runs forever", "A function that returns a number", "A variable that stores a list"], 0, "basics", "Recursion is a function calling itself on a smaller problem.", "EASY"),
      q("What is the main idea of object-oriented programming?", ["Programs are a list of commands with no structure", "Programs are organised around objects that combine data and behaviour", "Programs can only be written for the web", "Programs run without memory"], 1, "oop", "Objects bundle data and the functions that act on it.", "MEDIUM"),
      q("Which sorting algorithm has an average time complexity of O(n log n)?", ["Bubble sort", "Insertion sort", "Merge sort", "Selection sort"], 2, "algorithms", "Merge sort divides and merges in O(n log n).", "MEDIUM"),
      q("What does it mean to “debug” a program?", ["Write it faster", "Find and fix errors in it", "Delete old code", "Compress the files"], 1, "basics", "Debugging is locating and correcting faults.", "EASY"),
      q("What is an array index that starts at 0 called in most languages?", ["One-based indexing", "Zero-based indexing", "Reverse indexing", "Hash indexing"], 1, "data-structures", "The first element is at index 0.", "EASY"),
      q("Which is an advantage of using functions?", ["The same code can be reused and tested separately", "They make the program run slower", "They remove the need for variables", "They stop errors from happening"], 0, "basics", "Functions allow reuse and clearer structure.", "EASY"),
    ],
  },
  {
    key: "technical-database", name: "Technical: databases and SQL", topic: "Databases (BCA / MCA / B.Tech CS)", category: "TECHNICAL", paperTitle: "Databases and SQL (starter)", durationMin: 20, passPercent: 50,
    description: "10 questions on relational databases and basic SQL.",
    questions: [
      q("What does SQL stand for?", ["Structured Query Language", "Simple Question Language", "Sequential Query Logic", "System Quality Language"], 0, "sql", "SQL is the Structured Query Language.", "EASY"),
      q("Which SQL statement retrieves data from a table?", ["INSERT", "SELECT", "UPDATE", "DELETE"], 1, "sql", "SELECT reads rows.", "EASY"),
      q("What is a primary key?", ["A column that can hold duplicate values", "A column (or set of columns) that uniquely identifies each row", "The first column of every table", "A password for the database"], 1, "design", "A primary key uniquely identifies a row.", "EASY"),
      q("Which clause filters rows in a SELECT statement?", ["ORDER BY", "GROUP BY", "WHERE", "FROM"], 2, "sql", "WHERE keeps only rows that meet a condition.", "EASY"),
      q("What does a foreign key do?", ["Encrypts a column", "Links a row to a row in another table", "Sorts the table", "Deletes duplicate rows"], 1, "design", "It references the primary key of another table.", "MEDIUM"),
      q("Which statement counts the rows in a table named students?", ["SELECT COUNT(*) FROM students;", "COUNT students;", "SELECT students COUNT;", "SELECT SUM(*) FROM students;"], 0, "sql", "COUNT(*) returns the number of rows.", "EASY"),
      q("What is normalisation?", ["Making all values uppercase", "Organising tables to reduce duplicate data", "Copying a database", "Adding indexes to every column"], 1, "design", "Normalisation reduces redundancy and update problems.", "MEDIUM"),
      q("Which JOIN returns only rows that have matching values in both tables?", ["LEFT JOIN", "INNER JOIN", "FULL JOIN", "CROSS JOIN"], 1, "sql", "INNER JOIN keeps matching rows only.", "MEDIUM"),
      q("What does ACID stand for in database transactions?", ["Atomicity, Consistency, Isolation, Durability", "Access, Control, Integrity, Data", "Automatic, Complete, Indexed, Distributed", "Atomic, Cached, Isolated, Direct"], 0, "transactions", "ACID describes reliable transaction properties.", "MEDIUM"),
      q("Which command removes all rows from a table but keeps the table itself?", ["DROP TABLE", "TRUNCATE TABLE", "REMOVE TABLE", "CLEAR DATABASE"], 1, "sql", "TRUNCATE empties a table; DROP removes it.", "MEDIUM"),
    ],
  },
  {
    key: "technical-systems", name: "Technical: networks and operating systems", topic: "Systems (BCA / MCA / B.Tech CS)", category: "TECHNICAL", paperTitle: "Networks and operating systems (starter)", durationMin: 20, passPercent: 50,
    description: "10 questions on computer networks and operating-system basics.",
    questions: [
      q("What does an IP address identify?", ["A website's colour", "A device on a network", "A user's password", "A file type"], 1, "networks", "An IP address identifies a device's network location.", "EASY"),
      q("Which protocol is used to load web pages securely?", ["FTP", "HTTPS", "SMTP", "Telnet"], 1, "networks", "HTTPS is HTTP over an encrypted connection.", "EASY"),
      q("What does DNS do?", ["Encrypts email", "Translates domain names into IP addresses", "Speeds up the processor", "Stores web pages"], 1, "networks", "DNS maps names such as example.com to IP addresses.", "EASY"),
      q("Which layer of the OSI model is responsible for routing packets between networks?", ["Physical", "Data link", "Network", "Application"], 2, "networks", "The Network layer handles addressing and routing.", "MEDIUM"),
      q("What is a process in an operating system?", ["A program in execution", "A file on disk", "A kind of memory chip", "A network cable"], 0, "os", "A process is a running instance of a program.", "EASY"),
      q("What is a deadlock?", ["A process that finishes too fast", "Two or more processes waiting for each other forever", "A damaged hard disk", "A locked screen"], 1, "os", "In a deadlock none of the processes can proceed.", "MEDIUM"),
      q("Which of these is a function of an operating system?", ["Managing memory and files", "Designing web pages", "Writing documents", "Editing photos"], 0, "os", "The OS manages hardware resources, memory, files and processes.", "EASY"),
      q("What is the purpose of a firewall?", ["To cool the computer", "To filter network traffic according to security rules", "To store backups", "To increase internet speed"], 1, "networks", "A firewall allows or blocks traffic based on rules.", "EASY"),
      q("Which scheduling algorithm gives each process a fixed time slice in turn?", ["First come first served", "Round robin", "Shortest job first", "Priority scheduling"], 1, "os", "Round robin cycles through processes with a time quantum.", "MEDIUM"),
      q("What does virtual memory allow?", ["Programs to use more memory than the physical RAM by using disk space", "Faster internet", "Unlimited battery", "Free software"], 0, "os", "Virtual memory extends RAM using disk.", "MEDIUM"),
    ],
  },
];
export const starterByKey = (key: string) => STARTER_BANKS.find((b) => b.key === key) ?? null;
