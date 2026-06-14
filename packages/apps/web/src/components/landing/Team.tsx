"use client";

import React from "react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import Reveal from "@/components/landing/Reveal";

const teamMembers = [
  { name: "Yudhishthra Sugumaran", role: "Engineering", image: "/yudu.jpg" },
  { name: "Tomas Mazzitello", role: "Engineering", image: "/tom.jpg" },
  { name: "Lain Calvo", role: "Product", image: "/lain.jpg" },
  { name: "Axel Geslin", role: "Engineering", image: "/axel.jpg" },
  { name: "Shaun Lim", role: "Product", image: "/shaun.jpg" },
];

export default function Team() {
  return (
    <section className="section" id="team" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal>
          <div className="shead">
            <span className="eyebrow">Team</span>
            <h2 className="display">The people behind Keel.</h2>
          </div>
        </Reveal>

        <div className="team-grid">
          {teamMembers.map((member, index) => (
            <Reveal key={member.name} delay={index * 0.08}>
              <CardContainer className="!py-0">
                <CardBody className="tcard card group/card relative h-auto w-full">
                  <CardItem translateZ="80" className="w-full">
                    <div className="tavatar-img">
                      <img
                        src={member.image}
                        alt={member.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                      />
                    </div>
                  </CardItem>
                  <CardItem translateZ="50" className="tname">
                    {member.name}
                  </CardItem>
                  <CardItem
                    as="span"
                    translateZ="40"
                    className={`role-tag ${
                      member.role === "Engineering" ? "role-eng" : "role-prod"
                    }`}
                  >
                    {member.role}
                  </CardItem>
                </CardBody>
              </CardContainer>
            </Reveal>
          ))}
        </div>
      </div>

      <style>{`
        .team-grid { display:grid; grid-template-columns: repeat(5,1fr); gap:16px; margin-top:48px; }
        @media (max-width: 980px){ .team-grid { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 560px){ .team-grid { grid-template-columns: repeat(2,1fr); } }
        .tcard {
          padding:18px 16px 20px; display:flex; flex-direction:column; align-items:center;
          text-align:center; transition: box-shadow var(--t-base) var(--ease), border-color var(--t-base) var(--ease);
        }
        .tcard:hover { box-shadow: var(--sh-lg); border-color: var(--line-2); }
        .tavatar-img {
          width:100%; aspect-ratio: 1/1; border-radius: var(--r-md); overflow:hidden;
          background: var(--navy-tint-2); border:1px solid var(--line); margin-bottom:16px;
        }
        .tname {
          font-family: var(--f-display); font-weight:700; font-size:15px; letter-spacing:-0.02em;
          color: var(--fg-primary); line-height:1.25;
        }
        .role-tag {
          margin-top:12px; font-size:11px; font-weight:600; letter-spacing:0.04em;
          padding:5px 12px; border-radius: var(--r-pill);
        }
        .role-eng { background: var(--navy-tint); color: var(--navy); }
        .role-prod { background: var(--clay-tint); color: var(--clay-600); }
      `}</style>
    </section>
  );
}
