# Contributions

Every member has to complete at least 2 meaningful tasks per week, where a single development task should have a granularity of 0.5-1 day. The completed tasks have to be shown in the weekly TA meetings. You have one "Joker" to miss one weekly TA meeting and another "Joker" to once skip continuous progress over the remaining weeks of the course. Please note that you cannot make up for "missed" continuous progress, but you can "work ahead" by completing twice the amount of work in one week to skip progress on a subsequent week without using your "Joker". Please communicate your planning **ahead of time**.

Note: If a team member fails to show continuous progress after using their Joker, they will individually fail the overall course (unless there is a valid reason).

**You MUST**:
- Have two meaningful contributions per week.

**You CAN**:
- Have more than one commit per contribution.
- Have more than two contributions per week.
- Link issues to contributions descriptions for better traceability.

**You CANNOT**:
- Link the same commit more than once.
- Use a commit authored by another GitHub user.

---

## Contributions Week 1 - 26.03.2025 to 01.04.2025

| **Student**      | **Date**  | **Link to Commit**          | **Description**                     | **Relevance**                          |
|-------------------|-----------|-----------------------------|-------------------------------------|-----------------------------------------|
| **@Danino42** | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/33b9eacc5e1010665a69fe6987110aea0e17f3f3 https://github.com/zametrics/sopra-fs25-group-09-client/commit/6991354265714a2ca4045fd170519be2a98a792a         | Creating the files in order to have a functioning database (LobbyService.java, DTO Mapping etc.), basic version of the lobby-player functions (adding, removing). On the frontend lobby-creation function. | Being able to create lobbies is essential for our game, we needed this right at the beginning so that we have something to work with.     |
|                   | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/89bbc6c6bceaa4193ced8cd99d255b685a320b01          | Implementation of new error messages to login and new visualization for that.     | The login functionality was already implemented, the new error messages make it more clear what is happening.    |
| **@zametrics** | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/f33b7ae1e2b27039ced91dc5591f547974391c6a          | Fixed NullPointerException in `setDateOfBirth` method. | Prevents crashes related to null values in user birthdate handling. |
|                   | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/5407c66a768a650d5e39b6195b81746b765931b6          | Implemented Integration Tests for Login and Logout. | Ensures that login and logout functionality work correctly under different conditions. |
|                   | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/bd64c76bc52ccc11fb525cd33f403f62b1c486c9          | Extended `UserControllerTest` with Delete User Test Cases. | Validates correct behavior when users attempt to delete their accounts, ensuring security and proper error handling. |
| **@ortakyakuza** | 31.03.2025    |  https://github.com/zametrics/sopra-fs25-group-09-server/commit/a746660967007e1097e2f71ba3d870354637e6b5          | Updated `build.gradle` - Added jbcrypt for secure password hashing, replaced commented-out Spring Security dependency. | Improves security by enabling proper password hashing mechanisms. |
|                   | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/a746660967007e1097e2f71ba3d870354637e6b5          | Enhanced `UserController` with `deleteUser` endpoint. | Allows users to securely delete their accounts while enforcing authentication rules. |
|                   | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/a746660967007e1097e2f71ba3d870354637e6b5          | Updated `UserService` for secure password handling and user deletion. | Strengthens user authentication security and improves error handling when deleting users. |
|                   | 05.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/a746660967007e1097e2f71ba3d870354637e6b5          | Extended `UserControllerTest` with additional test cases for login and delete user functionalities. | Ensures that authentication and deletion processes function as expected, preventing unauthorized access. |
| **@iliasw15** | 31.03.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/81d88586eb177d2e4d556b108a36f5cabe890041          | Designed a prototype login page of our project based on the figma design     | The design of a website holds a lot of impression for a user using it, in this contribution the first basic styles for alot of upcoming sites was created.     |
|                   | 31.03.2025     | https://github.com/zametrics/sopra-fs25-group-09-client/commit/618ae358c354708c0ea2831aefc1417e5da867f7 https://github.com/zametrics/sopra-fs25-group-09-client/commit/89ba1e53fa8b6b72f766d38a6b4dc2279e46c3b4 https://github.com/zametrics/sopra-fs25-group-09-client/commit/9ccca15e017003096f6472702291b14934af9313          | Pushed all styles into a seperate css files, made some minor improvements to login site, created a register page design.     | Pushing the styles into a seperated page makes them be reusable, improvements to buttons to add more feedback makes site feel more alive and assets can be reused. Register page build using the new css file to keep design intergrity. |

---

## Contributions Week 2 - 02.04.2025 to 08.04.2025


| **Student**      | **Date**  | **Link to Commit**          | **Description**                     | **Relevance**                          |
|-------------------|-----------|-----------------------------|-------------------------------------|-----------------------------------------|
| **@Danino42** | 05.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/73830082821e8d8f543e2fbb56bf5f934daf80d9          | Creating the /lobbies/{lobbyId} route so that the lobbies can be visited. Till now only the default values are shown and the unique ID.     | Essential for the game functionality.     |
|                   | 07.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/852e4263b449074c2044d380302c44db9d1632a3          | Creating 'join-lobby' page, the player's status also gets tracked in the database. Also proper handling of wrong lobby IDs.    | Players now can join to lobbies and get re-directed to the lobby's page where they see the lobby's set values.   |
| **@zametrics**     | 06.04.2025   | https://github.com/zametrics/sopra-fs25-group-09-client/commit/035a7e8deb54b2566d29a1c7a02b4c695ff50541          | implemented chat system in lobbies page    |  People can chat with each other    |
|                   | 06.04.2025    | (https://github.com/zametrics/sopra-fs25-group-09-server/commit/94083508779d9e113e1a878768226419293a2823)          | Profile Picture Upload Feature    | People Can now choose an individual pfp     |
|                   | 06.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/407c606b910779c2592c0f012fa142fe7a146516   | Installed Socket IO and created Gcloud server to deploy  | Important for the chatting system   |
|                   | 06.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/f18088ee53e2a31c03deef16ba747d98196f5ecf   | Implement input validation for username and password (min length, special characters, etc.)  | Important for secure passwords  |
|  **@ortakyakuza** | 05.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/1f033bdb8bd879b7f47916b3841fee173a3698a9          | Implemented `LobbyControllerTest` to cover multiple lobby-related endpoints with unit tests    | Improves backend test coverage and helps ensure that key lobby functionalities behave as expected.     |
|                   | 08.05.2025    | (https://github.com/zametrics/sopra-fs25-group-09-server/commit/e8ad6e0928d6fa100964dece593f0ccaee93b277)          | Integrated ChatGPT API for dynamic word generation in backend     | Enables flexible and intelligent word generation based on language and type using GPT model     |
| **@iliasw15** | 06.04.2025    | (https://github.com/zametrics/sopra-fs25-group-09-client/commit/8c5616c0fb5823c6cd82fb73f2ec8f61f57181a6) https://github.com/zametrics/sopra-fs25-group-09-client/commit/8c5616c0fb5823c6cd82fb73f2ec8f61f57181a6 https://github.com/zametrics/sopra-fs25-group-09-client/commit/948e7bc41b2c7ce8d64ad5101ee9233ca43bbab3         | Redesignend the /user (now /home) page to be compliant to the rest of the website. Made the edit page look fitting to the /home page using a page template to elimate flickering     | Webdesign is one of the key importances of a good website. Thats why I focussed alot of time into making the edit page load smoothly.     |
|                   | 07.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/268b21e76ef471e2d22587d614a62e0f66a2e026 https://github.com/zametrics/sopra-fs25-group-09-client/commit/f718c5285d737cb4f4277bb468f1e7a973386188          | Prototyping the design of the lobby page to make it look nice.     | This prototype is important so the chat and other aspects of the /lobbies page are visible easily too enhance user experience.     |

---

## Contributions Week 3 - 09.03.2025 to 15.04.2025

| **Student**      | **Date**  | **Link to Commit**          | **Description**                     | **Relevance**                          |
|-------------------|-----------|-----------------------------|-------------------------------------|-----------------------------------------|
| **[@githubUser1]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **@Ortakyakuza** | 12.04.2025 | https://github.com/zametrics/sopra-fs25-group-09-server/commit/c619eb4933e9e4106c60fdde5a626170334d432b          | in GPTWordControllerTest wrote tests for updating lobby with newly defined values.     | Ensures that user-selected language and type are stored in the lobby and used for correct ChatGPT word retrieval    |
|                   | 12.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-server/commit/d7b670797a7f29eacb5c6f77ef096ce204c29d49          | Created unit tests for GPTWordController     | Verifies that the word generation endpoint behaves correctly for valid input, API failures, and missing parameters     |

| 14.04.2025    | https://github.com/zametrics/sopra-fs25-group-09-client/commit/c159180b9ca107e113d130efeaa3c3ac04e83a49        | Implemented background music playback logic (custom hook + UI in home/layout.tsx). Custom Hook is reusable, while play and mute buttons(UI) needs to be implemented every time(but can just be copy pasted)  |  Enables music control in frontend via toggle & volume slider, stored per session.   |
| **[@githubUser3]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser4]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |

---

## Contributions Week 4 - 16.04.2025 to 22.04.2025

| **Student**      | **Date**  | **Link to Commit**          | **Description**                     | **Relevance**                          |
|-------------------|-----------|-----------------------------|-------------------------------------|-----------------------------------------|
| **[@githubUser1]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser2]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser3]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser4]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |

---

---

## Contributions Week 5 - [Begin Date] to [End Date]

| **Student**      | **Date**  | **Link to Commit**          | **Description**                     | **Relevance**                          |
|-------------------|-----------|-----------------------------|-------------------------------------|-----------------------------------------|
| **[@githubUser1]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser2]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser3]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |
| **[@githubUser4]** | [date]    | [Link to Commit 1]          | [Brief description of the task]     | [Why this contribution is relevant]     |
|                   | [date]    | [Link to Commit 2]          | [Brief description of the task]     | [Why this contribution is relevant]     |


---

## Contributions Week 6 - [Begin Date] to [End Date]

*Continue with the same table format as above.*
